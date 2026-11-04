# Basecamp Bonding

A fifth tab for [Basecamp Pulse](https://basecamppulse.com): a shared calendar for cohort plans and a shared photo album for the memories, so sharing a plan or a picture is as simple as sending one text.

## Scope change (November 2026): hidden until the reveal

> This section is the plan of record for the next build. The rest of the README describes what exists today; it is updated as each piece lands.

The photos fellows send during Basecamp no longer appear as they arrive. They are collected, tagged and held back, then released all at once as a celebration after the program ends, in the Bonding tab and in a Claude Corps Google Drive. Until then the tab shows a countdown.

### What fellows see

- **Send photos exactly as today**: Add photos in the tab, or text, email or Slack them to Plans Bot. Nothing changes about how a photo gets in.
- **Nothing shows yet.** Instead of albums, the Photos section is a countdown to the reveal: days, hours, minutes, seconds, how many photos are waiting, how many events they cover, and how many you have sent. No thumbnails, not even your own; you get a "Received · N photos waiting" confirmation.
- **Tag people with @mentions.** Put `@johnny` or `@annie o` in the caption, the text, the email subject or the Slack message and the photo is tagged with that fellow. Spelling is matched to the roster name from the Connect tab, so `@jonny` still finds Johnny Appleseed. If two fellows share a first name, add a last initial (`@sam r`); otherwise an admin resolves it.
- **Albums are picked for you.** `#event-name` still works; without it, the photo's date, time and location (and who you RSVP'd with) decide which event album it belongs to. Everything else goes to the cohort album.
- **The reveal.** At the release moment the countdown becomes the album: cohort, one album per event, and the Tagged view, with downloads, reactions and comments as before. You can still tag yourself or anyone else in any photo afterwards, and untag yourself.
- **Your Drive folder.** Every released photo is filed in a Claude Corps Shared Drive. You get view access to `Cohort/` (everything), `Events/<event>/` (every event), and a private `People/<your name>/` folder with the photos you are tagged in plus every photo from the events you attended. The Drive share arrives by email at your roster address.

### What admins do

Admins are Claude Corps staff: anyone whose roster role is `staff`, plus ids listed in the `ADMIN_FELLOW_IDS` setting. Admins see an **Admin** bar at the top of the tab and a panel with four parts:

1. **Reveal**: set or clear the release date and time, or press **Release now**. The release also runs by itself at the set time. Admins can release one event's album, or a single photo, early.
2. **Hidden photos**: every photo waiting, with the album and people tags the app chose and how it chose them (hashtag, time, GPS, RSVP, @mention, Slack mention). A **Needs review** list collects ambiguous mentions ("@sam could be Sam Rivera or Sam Okoye") and low-confidence album picks, with one-tap fixes and suggested tags from the event's attendee list. Any photo can be **held** (never released) or deleted.
3. **Events**: how many photos each event is holding, with a per-event release.
4. **Drive**: sync status, retries, "share folders again" for new fellows, and a per-fellow Google email override for anyone whose roster email is not a Google account.

Day to day this is light: set the date once, glance at Needs review now and then, and let the scheduled release do the rest. Either Nihar or a Claude Corps admin can do all of it from a phone.

### Constraints to know about

- **Google Workspace is required** for the Drive filing: photos live in a Shared Drive that a Google service account can write to. Each fellow needs a Google account on their roster email (or an admin sets another email for them) to open their folder. `People/<name>/` folders hold shortcuts to the single copy in `Cohort/`, so the Cohort folder must stay shared with the whole cohort.
- **No face recognition.** People are tagged from @mentions (and Slack's native @user mentions), manual tags, and, for Drive, event attendance. A photo nobody mentions anyone in is tagged by nobody until someone tags it after the reveal.
- **Texted photos** stay carrier-compressed; after the reveal the sender can swap in the original as today. Texts and emails get no reply, so a fellow's only pre-reveal feedback is the "you've sent N" line in the tab (Slack does reply).
- **Hidden means hidden.** Photo files are served only with a signed link that expires in 24 hours and is only handed out for released photos (or to admins), so a hidden photo cannot be fetched by guessing its address. A photo held after someone loaded the tab can stay fetchable for up to a day.
- **Release time** is stored in UTC and shown in the cohort's time zone (`PLAN_TIMEZONE`). Photos that arrive after the reveal show up immediately, as today; there is no second countdown.
- **For the Pulse merge**: a scheduled (cron) handler, two new secrets (`PHOTO_URL_SECRET`, `GOOGLE_SERVICE_ACCOUNT_JSON`), a one-time database migration, and a real `role` from Pulse's session so staff are recognised as admins. Details in the runbook below once built.

## Why this exists

The same thing kept happening in the cohort. Several plans would form at the same time for the same time, and nobody knew who was going or where they would be. Lots of pictures got taken, but they were hard to share afterwards. Several people wanted a shared album, and everyone was running low on iCloud space.

## The problem it solves

Fellows want to get to know the rest of the cohort, but plans get scattered and it is hard to track who is going where. Pictures stay on separate phones. The cohort stays connected at a surface level, and the photos get lost to time.

## The solution

A Partiful-style event manager plus a photo album, inside the Pulse app every fellow already opens. It coordinates events, organizes photos and catalogs memories: who did what, when, and the pictures to prove it. Every event gets its own album, and there is a cohort-wide shared album for everything else. Photos come in by text, email or Slack as easily as by upload, and go back out at full resolution straight into the Photos app with the time and location data intact.

## What it does

- **Shared live calendar.** Propose an event with where, when and who; it appears on everyone's calendar within seconds. RSVP Going, Maybe or Can't, and tag who you are going with.
- **Reactions and comments** on every event and every photo.
- **One album per event, plus one cohort album.** Open any album, or see every photo in one place.
- **Tags and a "Tagged" view.** Tag who is in a photo; every fellow has a view of the photos they appear in.
- **Captions that travel with the photo.** Edit a caption in the app and it is written into the file you download.
- **Originals kept untouched, with time and place.** The file you send is the file that is stored, byte for byte, and the app reads its date, time and GPS so every photo knows when and where it was taken, whichever way it arrived. Open a photo to see "Where it was taken" on a map. On iPhone, "Save to Photos" puts it in the camera roll with that data intact; on a laptop, albums download as a zip. "Download · N new" grabs only what you have not saved yet. The table under "Full quality, time and location" says which routes keep what.
- **Plans Bot: one contact for photos and plans.** Scan a QR (or tap Text it / Email it) to save "Plans Bot" to your phone. Text or mail it photos from iOS or Android and they post themselves; Slack photos work the same way. Add "#event-name" to put them in an event album; otherwise they go to the cohort album. Review first, or turn on "Post mine automatically".
- **Text a plan in plain English and it becomes an event.** Send Plans Bot (by text, email or Slack) something like "Tacos at La Taqueria Friday 7pm", or "what: bowling, when: tomorrow 9pm, where: Mission Bowling Club", and the listing is created on the calendar with you as host. It understands today, tonight, tomorrow, weekdays, dates, times and ranges ("7-9pm"), and "at <place>". On Slack the bot replies with what it posted; by text (Google Voice) or email there is no reply, the event just appears on the calendar within seconds, and you can edit it in the tab.
- **Replace with the original.** Texted photos arrive compressed by the carrier; one tap swaps in the full-quality file from your camera roll and keeps the tags and comments.
- **"I was there".** One tap after an event marks you as there, so everyone can see who actually went. Attendance verification (host confirm, QR, passcode, vouches) is an optional feature, off by default; see below.
- **Looks like the Connect tab.** Same photos, initials and "org · city" lines as the roster; a fellow's name opens their card with a link to Connect.

## How to use it

1. Open the **Bonding** tab in Pulse.
2. Tap **Propose an event**, give it a title, a time and a place, and tag who you are going with.
3. See a plan you like? Tap **Going** or **Maybe**. The counts and faces update for everyone.
4. On the day, tap **I was there** on the event so it shows who actually went.
5. Add photos: tap **Add photos** in the event or cohort album, or just text, email or Slack them to Plans Bot with "#event-name" in the message.
6. In a hurry? Text Plans Bot the plan itself, "Trivia at the Page Thursday 7pm", and it posts the event for you.
7. Tag the people in each photo and add a caption if you like.
8. Find every photo of yourself under **Tagged**.
9. To keep a photo, open it and tap **Save to Photos** (iPhone) or **Download** (laptop). **Download all** or **Download · N new** does a whole album at once.
10. React and comment on events and photos as you go.

## Full quality, time and location, by route

The app never recompresses anything: whatever reaches it is stored as-is and served back as-is. What reaches it depends on the route, because phones and messaging apps strip things on the way out.

| How the photo gets in | Resolution | Date and time | Location (GPS) |
|---|---|---|---|
| **Share → Mail** to Plans Bot (pick "Actual Size") | Full | Kept | Kept (iPhone: Share sheet → Options → Location on, the default) |
| **In-app "Add photos"** from a laptop or Android | Full | Kept | Kept |
| **In-app "Add photos"** on iPhone | Full (iOS converts HEIC to JPEG) | Kept | Only if you tap Options → Location in the photo picker (iOS 17+); iOS strips it otherwise |
| **Slack** | Full file | Kept | Stripped by Slack |
| **Text (MMS)** to Plans Bot | Reduced by the carrier | Usually stripped | Stripped |

So the best route from a phone is **Share → Mail → Plans Bot** with "Actual Size": full file, time and place all intact. A texted photo shows "Reduced by MMS" in the app; tap **Replace with the original** to swap in the full file from your camera roll (same note as the picker about location on iPhone). Downloads and "Save to Photos" put the date and GPS back into the file, so the Photos app files it on the right day and the right place on the map.

## Attendance verification: optional, off by default

**Off (the default).** "I was there" is a one-tap self-report. It counts the moment you tap it, any time from 30 minutes before the event starts onward, with nothing for the host to confirm. Tapping it later than two days after the event shows an "added later" note on your name.

**On.** The same tap goes to the host to confirm. The host can also show a QR code or read out a randomly generated 6-digit passcode at the event, and either checks a fellow in instantly. After two days a claim needs proof: a photo from the event you are tagged in, the passcode, the host's confirm, or two confirmed attendees vouching for you.

To turn it on: tick **Verify attendance** in the demo bar (mock mode), set `VERIFY_ATTENDANCE = "true"` in `worker/wrangler.toml` (reference Worker), or pass `verifyAttendance: true` in the mount options to override whatever the backend says. No schema change either way.

## For the Pulse DEV team: migration runbook

The rest of this file is the step-by-step merge. It is built exactly like the Connect tab (CorpsConnect): a plain-JavaScript module with no framework and no build step, mounted by a thin Pulse-side adapter that calls `API.call('bb…')`, plus a reference Cloudflare Worker (D1 + R2) that the Pulse Worker absorbs. `docs/API.md` and `docs/INBOUND.md` hold the reference detail.

### File map

```
public/index.html                 demo shell only (Pulse header, 5-tab switch, demo bar). Not copied into Pulse.
public/bonding/basecampbonding.js the module: window.BasecampBonding.mount(el, { api, qrBase })   → copy
public/bonding/basecampbonding.css all classes bb-*, variables --bb-*                               → copy
public/bonding/shape.js           wire ↔ module translation (ISO dates ↔ ms), used by the adapter  → copy
public/bonding/qr.js              a copy of Pulse's /connect/qr.js (PulseQR)                        → not needed, Pulse has it
public/bonding/planparse.js       plain-English plan parser, shared by the Worker and the demo       → copy (the Worker imports it)
public/bonding/demo/              the sample photos the demo albums show                             → not needed
public/bonding/mock-api.js        in-browser api for the no-backend demo                           → not needed
public/bonding/worker-api.js      api client for the reference Worker (demo only)                  → not needed
pulse-adapter/bonding.js          becomes Pulse's public/js/bonding.js                              → copy
pulse-adapter/index.html.patch.md pointer to this README
worker/wrangler.toml              bindings, vars, the secrets list
worker/schema.sql                 11 bb_* tables (idempotent CREATE IF NOT EXISTS; bb_photos has lat/lng)
worker/seed.sql                   demo roster + events for local dev only
worker/src/index.js               router: the API route table, /photos/:id, /hooks/*, /bonding/contact.vcf, email()
worker/src/bonding.js             every /api/bb* handler + servePhoto
worker/src/exif.js                reads EXIF date and GPS from every stored JPEG (no dependencies)
worker/src/inbound.js             Slack, email and (unused here) Twilio ingestion
worker/src/util.js                ApiError, json, uuid, slugify, hmac, MAX_PHOTO_BYTES
worker/src/auth.js                resolveFellow(): the one function Pulse replaces
worker/scripts/test-inbound.sh    signed fake Slack + Twilio deliveries against a local Worker
docs/API.md                       every endpoint, request/response shapes, error codes
docs/INBOUND.md                   Slack app, Email Routing and Google Voice setup (Twilio section kept but not used)
```

### Run the demo locally

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

### The merge, step by step

Do the steps in order. Each one names the file to touch.

#### 1. Frontend

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

#### 2. Backend

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
VERIFY_ATTENDANCE = "false"                    # optional attendance verification; "true" turns it on
PLAN_TIMEZONE = "America/Los_Angeles"          # texted plans ("Friday 7pm") are read in this zone
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

#### 3. Roster

`bb_fellows` must contain every fellow with the same `id` Pulse uses, because every other `bb_*` table references it and the tab tags, invites and attendance by id. Three columns come straight from the CorpsConnect card so the tab looks like Connect: `photo_url` (the card photo, else initials), `host_org` and `city` (shown under every name as "host_org · city", exactly as the Connect list does). Use the same values CorpsConnect's `ccload` returns.

Option A, mirror: on sign-in (or nightly) upsert from Pulse's roster:

```sql
INSERT INTO bb_fellows (id, name, email, phone, photo_url, host_org, city, role) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, phone = excluded.phone, photo_url = excluded.photo_url,
  host_org = excluded.host_org, city = excluded.city, role = excluded.role;
```

Option B, point at the existing table: edit the queries that read the roster (`bb_fellows` appears in `bonding.js` lines for `load`, `invite` and `setInboundAuto`, in `inbound.js` for `fellowByEmail`, `fellowByPhone`, `identity` and `inboundAuto`, and in `auth.js`). The columns needed are `id, name, email, phone, photo_url, host_org, city, role`; keep `inbound_auto` somewhere (it is one integer per fellow for the "Post mine automatically" switch).

#### 4. Inbound channels: all free, nothing new to subscribe to

Three channels, all on things that already exist. `docs/INBOUND.md` has the details (Slack scopes and event subscriptions, Email Routing, Google Voice, the caption → album rules, how senders are matched to fellows).

**Slack** (already there): create the Slack app once, point its Events API at `https://basecamppulse.com/hooks/slack`, then:

```bash
npx wrangler secret put SLACK_SIGNING_SECRET   # Slack app > Basic Information
npx wrangler secret put SLACK_BOT_TOKEN        # Slack app > OAuth, xoxb-…
```

**Email** (Cloudflare Email Routing, free on the basecamppulse.com zone): dashboard → Email → Email Routing → create `photos@basecamppulse.com` → action **Send to a Worker** → the Pulse Worker. The `email()` export from step 2c receives it. Set `INBOUND_EMAIL` to that address. Fellows "Share → Mail" photos to it at full size.

**Texting** (Google Voice, free): create a Google Voice number on a Google account the team controls, turn on *Settings → Messages → Forward messages to email*, and in that Gmail add a filter *from:txt.voice.google.com → forward to photos@basecamppulse.com*. Gmail verifies the forwarding address once by mailing it a code; the Worker logs that code, so keep `npx wrangler tail` open while you add the address (details in `docs/INBOUND.md`). A photo texted to the number arrives at the Worker as an email with the image attached and the sender's number in the Google Voice From address and the subject; the handler matches it to `bb_fellows.phone`. Set `INBOUND_SMS_NUMBER` to the Google Voice number so the contact card and the "Text it" button use it. The Twilio code path (`/hooks/twilio`, `TWILIO_AUTH_TOKEN`) stays in the repo but is not wired in this plan.

**Image quality by channel.** In-app upload, Slack and email keep the original file. Texting does not: a photo sent to a Google Voice number travels as MMS, and MMS is carrier-compressed (typically to well under 1 MB, roughly 1–2 megapixels). RCS does not help here because Google Voice numbers do not support RCS, so an iPhone always falls back to MMS for them. The app compensates two ways: texted photos show a "Text · reduced" badge, and the sender gets a "Replace with the original" button in the lightbox that swaps in the full-quality file from their camera roll while keeping tags, reactions and comments (`bbreplacephoto`). The contact card carries the email address too, so "Share → Mail" is the one-tap full-quality route from a phone.

### Smoke test after merging

Use two phones signed in as two different fellows, one of them a host.

```
[ ] Bonding tab appears, loads, no console errors; switch indicator lands on the 5th tab
[ ] "Tag fellows" list shows the same photos and "org · city" lines as the Connect tab
[ ] Propose an event (title, time, place, tag the other fellow) → it appears on phone 2 within 15 s
[ ] RSVP Going on phone 2 → count updates on phone 1; react and comment both ways
[ ] Set an event starting now; phone 2 taps "I was there" → counted at once on both phones (verification off, the default)
[ ] (VERIFY_ATTENDANCE=true) phone 2 taps "I was there" → phone 1 (host) sees it and confirms
[ ] (VERIFY_ATTENDANCE=true) host taps "Show check-in code"; phone 2 scans the QR → lands on basecamppulse.com/#bb-checkin-… → confirmed via QR
[ ] (VERIFY_ATTENDANCE=true) host taps "Get a new code"; phone 2 enters the 6-digit passcode → confirmed; the old passcode is rejected
[ ] Upload 2 photos to the event album from phone 2; thumbs show; tag phone 1's fellow → appears in their Tagged tab
[ ] Open a photo, add a caption, tap "Save to Photos" on an iPhone → share sheet → Save Image → in the camera roll with the caption
[ ] "Download all" on a laptop → zip of originals; "Download · N new" after adding one more photo
[ ] Post a photo in the Slack channel with "#<event>" → it shows in the sender's review banner → Keep → in the event album
[ ] Share → Mail a photo to photos@basecamppulse.com with "#<event>" in the subject → arrives full size in the event album
[ ] Text "Trivia at the Page Thursday 7pm" to the Google Voice number (or post it in the Slack channel) → the event appears on the calendar with the sender as host; on Slack the bot replies with what it posted (no reply by text or email)
[ ] Adding photos@basecamppulse.com as a Gmail forwarding address: the confirmation code shows up in `npx wrangler tail`
[ ] Text a photo to the Google Voice number from a phone on the roster → arrives (compressed) with the "Text · reduced" badge; "Replace with the original" swaps in the full file and keeps the tags
[ ] GET /photos/<id>?size=orig returns the untouched file with Content-Disposition attachment
[ ] Mail a photo (Actual Size) with location → the lightbox shows "Where it was taken" and a map link; Save to Photos on an iPhone lands it on the right day and place
```

### Known gaps and decisions for the DEV team

- `resolveFellow()` in `worker/src/auth.js` is a dev stub; the merge is not done until it reads Pulse's session. `PULSE_SHARED_SECRET` is reserved for that and unused by the stub.
- Roster: pick option A or B above. With neither, `load()` returns an empty roster and tagging breaks.
- `IMAGES` binding is optional. Without it, `GET /photos/:id?size=full` returns the original bytes (fine on Wi-Fi, heavy on cellular for 10 MB originals). Thumbs are made on the phone at upload, so the grid is light either way.
- Inbound photos sit as `pending` for the sender and are accepted automatically after 24 h on the next `bbload` (`PENDING_AUTO_ACCEPT` in `worker/src/bonding.js`). Inbound photos have no thumb (`thumb_key` NULL), so the grid serves the original for those until a thumb is generated; a small job or the IMAGES binding would fix that.
- If `bb_photos` already existed before this version, add the two GPS columns by hand: `ALTER TABLE bb_photos ADD COLUMN lat REAL; ALTER TABLE bb_photos ADD COLUMN lng REAL;` (a fresh `schema.sql` run includes them).
- Attendance verification is off by default (`VERIFY_ATTENDANCE`). Flip the var to turn it on; no schema change, the tables and endpoints are always there.
- Fellows can turn on "Post mine automatically" (`bb_fellows.inbound_auto`), which skips the review list entirely. Decide whether that should be the default.
- Polling: the module calls `bbload` every 15 s per open tab (5 s within two hours of an event). `bbload` returns the whole dataset; fine for one cohort, worth a `since` parameter if it grows.
- Google Voice is a personal-use product with no API and no RCS; the forward-to-Gmail route is the only automation, and texted photos are MMS-compressed (see step 4). If that ever becomes a problem, the Twilio handler is already in `inbound.js`.
- Not exercised against real services: Slack Events API delivery, Cloudflare Email Routing, Google Voice forwarding, and Save to Photos on a physical iPhone. The signed-webhook and email handlers were tested locally with wrangler's `/cdn-cgi/handler/email` endpoint and `scripts/test-inbound.sh`.
