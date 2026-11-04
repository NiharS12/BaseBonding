# Basecamp Bonding: migration runbook

Basecamp Bonding is a fifth tab for [Basecamp Pulse](https://basecamppulse.com): team bonding events on a shared live calendar, "I was there" attendance verified by host confirm, QR or a 6-digit passcode, and cohort / per-event photo albums with tags, captions, reactions and comments. It is built exactly like the Connect tab (CorpsConnect): a plain-JavaScript module with no framework and no build step, mounted by a thin Pulse-side adapter that calls `API.call('bb…')`, plus a reference Cloudflare Worker (D1 + R2) that the Pulse Worker absorbs. This README is the step-by-step merge for the Pulse DEV team; `docs/API.md` and `docs/INBOUND.md` hold the reference detail.

## File map

```
public/index.html                 demo shell only (Pulse header, 5-tab switch, demo bar). Not copied into Pulse.
public/bonding/basecampbonding.js the module: window.BasecampBonding.mount(el, { api, qrBase })   → copy
public/bonding/basecampbonding.css all classes bb-*, variables --bb-*                               → copy
public/bonding/shape.js           wire ↔ module translation (ISO dates ↔ ms), used by the adapter  → copy
public/bonding/qr.js              a copy of Pulse's /connect/qr.js (PulseQR)                        → not needed, Pulse has it
public/bonding/mock-api.js        in-browser api for the no-backend demo                           → not needed
public/bonding/worker-api.js      api client for the reference Worker (demo only)                  → not needed
pulse-adapter/bonding.js          becomes Pulse's public/js/bonding.js                              → copy
pulse-adapter/index.html.patch.md pointer to this README
worker/wrangler.toml              bindings, vars, the secrets list
worker/schema.sql                 11 bb_* tables (idempotent CREATE IF NOT EXISTS)
worker/seed.sql                   demo roster + events for local dev only
worker/src/index.js               router: the API route table, /photos/:id, /hooks/*, /bonding/contact.vcf, email()
worker/src/bonding.js             every /api/bb* handler + servePhoto
worker/src/inbound.js             Slack, email and (unused here) Twilio ingestion
worker/src/util.js                ApiError, json, uuid, slugify, hmac, MAX_PHOTO_BYTES
worker/src/auth.js                resolveFellow(): the one function Pulse replaces
worker/scripts/test-inbound.sh    signed fake Slack + Twilio deliveries against a local Worker
docs/API.md                       every endpoint, request/response shapes, error codes
docs/INBOUND.md                   Slack app, Email Routing and Google Voice setup (Twilio section kept but not used)
```

## Run the demo locally

Mock mode, no backend (data lives in the browser; open two tabs as two fellows to see live updates):

```bash
cd public && python3 -m http.server 8790
```

Real backend (local D1 + R2, no Cloudflare account needed):

```bash
cd worker && cp .dev.vars.example .dev.vars && npm install && npm run db:init && npx wrangler dev --port 8787
```

Open http://localhost:8787. Dev sign-in is a header, with ids from `worker/seed.sql`:

```bash
curl -s -X POST localhost:8787/api/bbload -H 'X-Dev-Fellow: f0000000-0000-4000-8000-000000000001' | head -c 300
```

`Authorization: Bearer dev:<id>` works too. `npm run db:reset` reseeds; `npm run test:inbound` posts a signed Slack webhook (and a Twilio one, which this plan does not use).

## Migration runbook

Do the steps in order. Each one names the file to touch.

### 1. Frontend

**1a. Copy the module into Pulse's `public/`:**

```bash
cp public/bonding/basecampbonding.js public/bonding/basecampbonding.css public/bonding/shape.js  <pulse>/public/bonding/
cp pulse-adapter/bonding.js  <pulse>/public/js/bonding.js
```

The adapter loads `/connect/qr.js` only if `window.PulseQR` is missing, so Pulse's existing copy is reused.

**1b. `public/index.html`: the fifth tab button.** In `#dSwitch`, after the Connect button:

```html
<button role="tab" id="dsBonding" data-dmode="bonding" aria-selected="false">Bonding</button>
```

**1c. `public/index.html`: the mount section.** Next to `<section id="corpsconnect" …>`, shown the same way the Connect pane is:

```html
<section id="basecampbonding" aria-label="Basecamp Bonding" hidden></section>
```

The id `basecampbonding` is what `js/bonding.js` mounts into. Reuse whatever attribute or class Pulse uses to show the Connect pane for `data-dmode="bonding"`.

**1d. `public/app.css`: five columns in the switch.**

```css
.dswitch{grid-template-columns:repeat(5,minmax(0,1fr))}
.dswitch .dind{width:calc((100% - 8px) / 5)}
.dswitch[data-on="bonding"] .dind{transform:translateX(400%)}
@media (max-width:420px){.dswitch button{font-size:14px;padding-inline:4px}}
```

**1e. `public/js/main.js`: the import.**

```js
import './connect.js';
import './bonding.js';
```

**1f. Hash router: scanned check-in codes.** The host's QR encodes `https://basecamppulse.com/#bb-checkin-<eventId>-<token>`. Wherever Pulse handles `#connect-<code>` on load and `hashchange` (the `hooks.scanned` path in shell.js / state.js), add the same for Bonding:

```js
// next to the #connect- handling
const bb = /^#bb-checkin-(.+)$/.exec(location.hash);
if (bb) { history.replaceState(null, '', location.pathname); hooks.bbscanned?.(bb[1]); }
```

and make `hooks.openBondingTab` switch to the Bonding tab the way `hooks.openConnectTab` does. "Open in Connect" on a fellow's name calls `hooks.openConnectTab()` and then drives Connect's search box; if you'd rather, export `openFellow(id)` from `corpsconnect.js` and set `hooks.openConnectFellow = id => cc.openFellow(id)` in `connect.js`, which the adapter prefers when present. The adapter registers `hooks.bonding` (tab opened), `hooks.bbscanned` (code arrived) and reads `startHash` for a code that came in before sign-in. The `db` guard in the adapter means the tab mounts only after sign-in.

### 2. Backend

**2a. `worker/schema.sql` → Pulse's D1.** All tables are `bb_`-prefixed; nothing collides.

```bash
npx wrangler d1 execute <pulse-db-name> --remote --file=worker/schema.sql
```

**2b. R2 bucket and bindings.**

```bash
npx wrangler r2 bucket create basecamp-bonding-photos
```

Add to Pulse's `wrangler.toml` (names from `worker/wrangler.toml`):

```toml
compatibility_flags = ["nodejs_compat"]

[[r2_buckets]]
binding = "PHOTOS"
bucket_name = "basecamp-bonding-photos"

[vars]
INBOUND_SLACK_CHANNEL = "#cohort-photos"
INBOUND_SMS_NUMBER = "+1415…"                  # the Google Voice number, E.164
INBOUND_EMAIL = "photos@basecamppulse.com"     # the Email Routing address
```

The handlers read Pulse's existing D1 binding as `env.DB`. If Pulse's binding has another name, alias it once at the top of the merged router (`env.DB ??= env.<name>`).

**2c. Merge the Worker code.** Copy `worker/src/bonding.js`, `inbound.js` and `util.js` into Pulse's Worker source (`inbound.js` imports `postal-mime`, so `npm install postal-mime` there). Then mount the route table from `worker/src/index.js` in Pulse's router. The `API` object maps `bb<name>` → handler; every handler is `({ env, me, request, ctx, body }) => result`, where `me` is the signed-in fellow. The pieces to add:

```js
import * as bonding from './bonding.js';
import { handleEmail, handleSlack } from './inbound.js';

// inside fetch(), before Pulse's own routes
if (path.startsWith('/api/bb'))        return handleApi(request, env, ctx, path.slice(5).toLowerCase()); // from index.js
if (path.startsWith('/photos/'))       return bonding.servePhoto(request, env, path.slice(8), url.searchParams.get('size'));
if (path === '/hooks/slack')           return handleSlack(request, env, ctx);
if (path === '/bonding/contact.vcf')   return contactCard(env);                                       // from index.js
// /hooks/twilio exists in index.js but is not part of this plan (paid); leave it out.

// on the default export, for Email Routing
async email(message, env, ctx) { return handleEmail(message, env, ctx); }
```

`handleApi` and `contactCard` can be lifted verbatim from `worker/src/index.js`. Errors are thrown as `ApiError(code, status)` and must come back as `{ "error": "<code>" }` with that status, which is what Pulse's `api.js` already turns into `ApiError` on the phone.

**2d. `worker/src/auth.js`: replace `resolveFellow()`.** It is the only place that decides who is calling. Pulse already sends `Authorization: Bearer <session token>` on every `API.call()`; swap the dev scheme for Pulse's session lookup and return this shape:

```js
export async function resolveFellow(request, env) {
  const fellow = await pulseSessionToFellow(request, env);   // Pulse's own lookup
  if (!fellow) throw new ApiError('signed_out', 401);
  return { id, name, email, phone, photo_url, host_org, city, role };   // id must match bb_fellows.id
}
```

The multipart upload in `pulse-adapter/bonding.js` posts straight to `/api/bbuploadphoto` with the same bearer header (Pulse's `API.call` is JSON-only), so one lookup covers both.

### 3. Roster

`bb_fellows` must contain every fellow with the same `id` Pulse uses, because every other `bb_*` table references it and the tab tags, invites and attendance by id. Three columns come straight from the CorpsConnect card so the tab looks like Connect: `photo_url` (the card photo, else initials), `host_org` and `city` (shown under every name as "host_org · city", exactly as the Connect list does). Use the same values CorpsConnect's `ccload` returns.

Option A, mirror: on sign-in (or nightly) upsert from Pulse's roster:

```sql
INSERT INTO bb_fellows (id, name, email, phone, photo_url, host_org, city, role) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, phone = excluded.phone, photo_url = excluded.photo_url,
  host_org = excluded.host_org, city = excluded.city, role = excluded.role;
```

Option B, point at the existing table: edit the queries that read the roster (`bb_fellows` appears in `bonding.js` lines for `load`, `invite` and `setInboundAuto`, in `inbound.js` for `fellowByEmail`, `fellowByPhone`, `identity` and `inboundAuto`, and in `auth.js`). The columns needed are `id, name, email, phone, photo_url, host_org, city, role`; keep `inbound_auto` somewhere (it is one integer per fellow for the "Post mine automatically" switch).

### 4. Inbound channels: all free, nothing new to subscribe to

Three channels, all on things that already exist. `docs/INBOUND.md` has the details (Slack scopes and event subscriptions, Email Routing, Google Voice, the caption → album rules, how senders are matched to fellows).

**Slack** (already there): create the Slack app once, point its Events API at `https://basecamppulse.com/hooks/slack`, then:

```bash
npx wrangler secret put SLACK_SIGNING_SECRET   # Slack app > Basic Information
npx wrangler secret put SLACK_BOT_TOKEN        # Slack app > OAuth, xoxb-…
```

**Email** (Cloudflare Email Routing, free on the basecamppulse.com zone): dashboard → Email → Email Routing → create `photos@basecamppulse.com` → action **Send to a Worker** → the Pulse Worker. The `email()` export from step 2c receives it. Set `INBOUND_EMAIL` to that address. Fellows "Share → Mail" photos to it at full size.

**Texting** (Google Voice, free): create a Google Voice number on a Google account the team controls, turn on *Settings → Messages → Forward messages to email*, and in that Gmail add a filter *from:txt.voice.google.com → forward to photos@basecamppulse.com* (Gmail asks to verify the forwarding address once). A photo texted to the number arrives at the Worker as an email with the image attached and the sender's number in the subject; the handler matches it to `bb_fellows.phone`. Set `INBOUND_SMS_NUMBER` to the Google Voice number so the contact card and the "Text it" button use it. The Twilio code path (`/hooks/twilio`, `TWILIO_AUTH_TOKEN`) stays in the repo but is not wired in this plan.

**Image quality by channel.** In-app upload, Slack and email keep the original file. Texting does not: a photo sent to a Google Voice number travels as MMS, and MMS is carrier-compressed (typically to well under 1 MB, roughly 1–2 megapixels). RCS does not help here because Google Voice numbers do not support RCS, so an iPhone always falls back to MMS for them. The app compensates two ways: texted photos show a "Text · reduced" badge, and the sender gets a "Replace with the original" button in the lightbox that swaps in the full-quality file from their camera roll while keeping tags, reactions and comments (`bbreplacephoto`). The contact card carries the email address too, so "Share → Mail" is the one-tap full-quality route from a phone.

## Smoke test after merging

Use two phones signed in as two different fellows, one of them a host.

```
[ ] Bonding tab appears, loads, no console errors; switch indicator lands on the 5th tab
[ ] "Tag fellows" list shows the same photos and "org · city" lines as the Connect tab
[ ] Propose an event (title, time, place, tag the other fellow) → it appears on phone 2 within 15 s
[ ] RSVP Going on phone 2 → count updates on phone 1; react and comment both ways
[ ] Set an event starting now; phone 2 taps "I was there" → phone 1 (host) sees it and confirms
[ ] Host taps "Show check-in code"; phone 2 scans the QR → lands on basecamppulse.com/#bb-checkin-… → confirmed via QR
[ ] Host taps "Get a new code"; phone 2 enters the 6-digit passcode → confirmed; the old passcode is rejected
[ ] Upload 2 photos to the event album from phone 2; thumbs show; tag phone 1's fellow → appears in their Tagged tab
[ ] Open a photo, add a caption, tap "Save to Photos" on an iPhone → share sheet → Save Image → in the camera roll with the caption
[ ] "Download all" on a laptop → zip of originals; "Download · N new" after adding one more photo
[ ] Post a photo in the Slack channel with "#<event>" → it shows in the sender's review banner → Keep → in the event album
[ ] Share → Mail a photo to photos@basecamppulse.com with "#<event>" in the subject → arrives full size in the event album
[ ] Text a photo to the Google Voice number from a phone on the roster → arrives (compressed) with the "Text · reduced" badge; "Replace with the original" swaps in the full file and keeps the tags
[ ] GET /photos/<id>?size=orig returns the untouched file with Content-Disposition attachment
```

## Known gaps and decisions for the DEV team

- `resolveFellow()` in `worker/src/auth.js` is a dev stub; the merge is not done until it reads Pulse's session. `PULSE_SHARED_SECRET` is reserved for that and unused by the stub.
- Roster: pick option A or B above. With neither, `load()` returns an empty roster and tagging breaks.
- `IMAGES` binding is optional. Without it, `GET /photos/:id?size=full` returns the original bytes (fine on Wi-Fi, heavy on cellular for 10 MB originals). Thumbs are made on the phone at upload, so the grid is light either way.
- Inbound photos sit as `pending` for the sender and are accepted automatically after 24 h on the next `bbload` (`PENDING_AUTO_ACCEPT` in `worker/src/bonding.js`). Inbound photos have no thumb (`thumb_key` NULL), so the grid serves the original for those until a thumb is generated; a small job or the IMAGES binding would fix that.
- Fellows can turn on "Post mine automatically" (`bb_fellows.inbound_auto`), which skips the review list entirely. Decide whether that should be the default.
- Polling: the module calls `bbload` every 15 s per open tab (5 s within two hours of an event). `bbload` returns the whole dataset; fine for one cohort, worth a `since` parameter if it grows.
- Google Voice is a personal-use product with no API and no RCS; the forward-to-Gmail route is the only automation, and texted photos are MMS-compressed (see step 4). If that ever becomes a problem, the Twilio handler is already in `inbound.js`.
- Not exercised against real services: Slack Events API delivery, Cloudflare Email Routing, Google Voice forwarding, and Save to Photos on a physical iPhone. The signed-webhook and email handlers were tested locally with wrangler's `/cdn-cgi/handler/email` endpoint and `scripts/test-inbound.sh`.
