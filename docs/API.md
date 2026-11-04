# Basecamp Bonding: API

Reference backend in `worker/`. Every api-contract function is one endpoint:

```
POST /api/bb<function name, lowercased>      JSON in, JSON out
GET  /photos/:id?size=thumb|full|orig         photo bytes from R2
POST /hooks/slack, POST /hooks/twilio         inbound photos (see INBOUND.md)
```

**Auth.** Every `/api/*` call needs a signed-in fellow. Pulse sends `Authorization: Bearer <session>`;
the reference worker's `worker/src/auth.js` (`resolveFellow`) is the one function the DEV team
swaps for Pulse's session lookup. Until then it accepts `Authorization: Bearer dev:<fellowId>` or
`X-Dev-Fellow: <fellowId>` for any id in `bb_fellows` (see `worker/seed.sql`, e.g.
`f0000000-0000-4000-8000-000000000001` = Ada Okafor).

**Errors.** `{ "error": "<code>" }` with a 4xx/5xx status, matching Pulse's `ApiError(code, status)`.

| code | status | when |
|---|---|---|
| `signed_out` | 401 | no / unknown token |
| `not_host` | 403 | host-only action (`updateEvent`, `cancelEvent`, `confirmAttendance`, `newCheckinCode`) |
| `not_allowed` | 403 | not your photo/comment, vouching without confirmed attendance, confirming someone else's inbound photo |
| `window_closed` | 409 | `attend` outside 30 min before start → 48 h after end; `attendLate` before the window opens |
| `bad_text` | 400 | empty / too long title, comment, caption |
| `too_big` | 413 | photo over 25 MB |
| `gone` | 404 | event cancelled or missing, photo/comment/attendance row missing |
| `bad_code` | 400/404 | malformed / unknown check-in code |
| `slow_down` | 429 | more than 5 comments in 10 s |
| `already` | 409 | duplicate vouch, vouching for an already confirmed attendee |
| `bad_id`, `bad_time`, `bad_status`, `bad_target`, `bad_emoji`, `bad_file`, `bad_tags`, `bad_json` | 400 | malformed input |
| `server_error` | 500 | unhandled |

All ids are uuid strings; all times are ISO-8601 UTC. Fellow ids are the keys everywhere
(`host_id`, `fellow_id`, `uploader_id`, `tags`).

---

## `POST /api/bbload` → everything the tab renders

Request: `{}`

```json
{
  "me": { "id": "f0…01", "name": "Ada Okafor", "email": "ada.okafor@example.org", "phone": "+14155550101", "photo_url": null, "role": "fellow" },
  "fellows": [ { "id": "f0…01", "name": "Ada Okafor", "email": "…", "phone": "…", "photo_url": null, "role": "fellow" }, … ],
  "events": [ <Event>, … ],            // all events incl. cancelled (cancelled:true), ordered by starts_at
  "photos": [ <Photo>, … ],            // status 'ok' for everyone + my own 'pending' inbound photos, newest first
  "inbound": { "slackChannel": "#cohort-photos", "smsNumber": "+1415…" },
  "serverTime": "2026-11-04T08:43:09.607Z"
}
```

### Event

```json
{
  "id": "e0…01", "title": "Trivia night at Zeitgeist", "description": "…",
  "starts_at": "2026-11-05T04:00:00Z", "ends_at": "2026-11-05T06:30:00Z",
  "location": "Zeitgeist, 199 Valencia St", "location_url": "https://maps…", "host_id": "f0…01",
  "cancelled": false, "created_at": "…", "updated_at": "…",
  "rsvps":      [ { "fellow_id": "f0…02", "status": "going" } ],          // going | maybe | no
  "invites":    [ "f0…02", "f0…03" ],                                      // "with whom"
  "attendance": [ { "fellow_id": "f0…02", "status": "confirmed", "via": "host", "late": false,
                    "created_at": "…", "confirmed_at": "…" } ],            // status claimed|confirmed|pending|denied, via tap|host|qr|photo|vouch
  "vouches":    { "f0…07": 2 },                                            // distinct vouch count per pending fellow
  "reactions":  [ { "emoji": "🔥", "fellow_id": "f0…03" } ],
  "comments":   [ { "id": "c0…01", "target_type": "event", "target_id": "e0…01", "fellow_id": "f0…02",
                    "text": "…", "created_at": "…", "reactions": [ { "emoji": "😂", "fellow_id": "f0…01" } ] } ],
  "photoCount": 3,
  "checkinToken": "seedtok-trivia-01"                                      // only present when me is the host
}
```
Only `confirmed` attendance counts as "was there"; `pending`/`denied` never do; `late:true`
rows show "added later".

### Photo

```json
{
  "id": "30e7…", "event_id": "e0…01" | null, "uploader_id": "f0…01",
  "filename": "IMG_0042.jpeg", "content_type": "image/jpeg", "bytes": 2481002, "width": 4032, "height": 3024,
  "caption": "lanes", "source": "app",          // app | slack | sms
  "status": "ok",                               // ok | pending (inbound, awaiting the sender's confirm)
  "hasThumb": true,                             // false for inbound photos: /photos/:id serves the original instead
  "created_at": "…", "url": "/photos/30e7…",
  "tags": [ "f0…02" ],
  "reactions": [ { "emoji": "❤️", "fellow_id": "f0…02" } ],
  "comments": [ <Comment> ]
}
```

---

## Events

| endpoint | request | response |
|---|---|---|
| `bbcreateevent` | `{ "title", "starts_at", "ends_at"?, "description"?, "location"?, "location_url"?, "invites"?: [fellowId] }` (also accepted wrapped as `{ "fields": {…} }`). `ends_at` defaults to start + 2 h. Host = caller, auto-RSVP going. | Event |
| `bbupdateevent` | `{ "eventId", "fields": { any of the above } }` host only | Event |
| `bbcancelevent` | `{ "eventId" }` host only | Event (`cancelled: true`) |
| `bbrsvp` | `{ "eventId", "status": "going" \| "maybe" \| "no" \| "none" }` (`none` removes) | Event |
| `bbinvite` | `{ "eventId", "fellowIds": [ … ] }` any fellow may add people; unknown ids ignored | Event |

Example:
```bash
curl -X POST localhost:8787/api/bbcreateevent -H 'X-Dev-Fellow: f0000000-0000-4000-8000-000000000002' \
  -H 'content-type: application/json' \
  -d '{"title":"Bowling","starts_at":"2026-11-10T03:00:00Z","location":"Mission Bowling Club","invites":["f0000000-0000-4000-8000-000000000001"]}'
```

## Attendance

| endpoint | request | rule | response |
|---|---|---|---|
| `bbattend` | `{ "eventId" }` | only from 30 min before `starts_at` to 48 h after `ends_at`, else `window_closed`. Sets `claimed` via `tap` (idempotent if already claimed/confirmed). | Event |
| `bbattendlate` | `{ "eventId", "photoId"? }` | after the window. If `photoId` is given and the caller is tagged in it (and it belongs to the event), or the caller is tagged in any photo of the event → `confirmed` via `photo`. Otherwise `pending` via `tap`, `late: true`. Inside the window it behaves like `bbattend`; before the window → `window_closed`. | Event |
| `bbconfirmattendance` | `{ "eventId", "fellowId", "ok": true\|false }` host only | `ok:true` → `confirmed` via `host`. `ok:false` → `denied` for late claims, row removed for in-window claims. | Event |
| `bbvouch` | `{ "eventId", "fellowId" }` | caller must have `confirmed` attendance (`not_allowed`); target must be `claimed`/`pending` (`already` if confirmed); one vouch per voucher (`already`). 2 distinct vouches → `confirmed` via `vouch`. | Event |
| `bbnewcheckincode` | `{ "eventId" }` host only | rotates both the QR token and the 6-digit passcode | `{ "code": "<eventId>-<token>", "pin": "483921" }` |
| `bbcheckin` | `{ "code" }` | accepts `<eventId>-<token>`, `bb-checkin-<eventId>-<token>` (what the QR encodes), `<eventId>-<6-digit pin>` (typed from the host's screen) or a bare token. Unknown → `bad_code`. Sets `confirmed` via `qr` (scan) or `code` (passcode); `late: true` when the window has closed. | Event |

The QR the host shows encodes `<pulse base url>#bb-checkin-<code>`; the module reads the hash
on load and calls `bbcheckin`.

## Reactions & comments

| endpoint | request | response |
|---|---|---|
| `bbreact` | `{ "target": { "type": "event"\|"photo"\|"comment", "id" }, "emoji": "🔥"\|"❤️"\|"😂"\|"👏"\|"🙌", "on"?: bool }` — omit `on` to toggle | the target (for a comment: its parent event/photo) |
| `bbcomment` | `{ "target": { "type": "event"\|"photo", "id" }, "text", "id"? }` — optional client id makes retries idempotent; 1000 chars max | the target |
| `bbdeletecomment` | `{ "id" }` — author, or host of the event the comment/photo belongs to | the parent target |

## Photos

### `bbuploadphoto`
Multipart `multipart/form-data` (preferred; original bytes untouched):

| field | |
|---|---|
| `file` | the original image (any `image/*`, ≤ 25 MB → `too_big`) |
| `thumb` | client-generated ~400px JPEG (optional but expected from the app) |
| `eventId` | optional; omit for the cohort album |
| `caption` | optional, ≤ 500 chars |
| `tags` | JSON array of fellow ids |
| `width`, `height` | original pixel size (optional) |
| `taken_at` | ISO time the photo was taken, read from EXIF on the phone (optional). Albums sort by it; the app stamps it back into downloads. |

JSON fallback: `{ "data": "<base64>", "thumb": "<base64 jpeg>"?, "filename", "contentType", "eventId"?, "caption"?, "tags"?, "width"?, "height"? }`.

R2 keys: `orig/<id>.<ext>` and `thumb/<id>.jpg`. Returns the Photo.

```bash
curl -X POST localhost:8787/api/bbuploadphoto -H 'X-Dev-Fellow: f0000000-0000-4000-8000-000000000001' \
  -F file=@IMG_0042.jpeg -F thumb=@thumb.jpg -F eventId=e0000000-0000-4000-8000-000000000001 \
  -F caption='lanes' -F 'tags=["f0000000-0000-4000-8000-000000000002"]' -F width=4032 -F height=3024
```

| endpoint | request | rule | response |
|---|---|---|---|
| `bbupdatephoto` | `{ "photoId", "fields": { "caption"?, "eventId"? (null = cohort), "tags"? } }` (fields may also be top-level) | `caption`/`eventId`: uploader or host of the photo's event; `tags`: anyone (replaces the list) | Photo |
| `bbdeletephoto` | `{ "photoId" }` | uploader or host of the photo's event | `{ "ok": true, "id" }` |
| `bbuntagme` | `{ "photoId" }` | removes the caller's tag | Photo |
| `bbdownloadalbum` | `{}` cohort (all), `{ "eventId" }`, or `{ "tagged": true }` | | `[ { "id", "url": "/photos/<id>?size=orig", "filename", "bytes" } ]` (module zips client-side) |
| `bbconfirminbound` | `{ "photoId", "eventId"? }` | uploader only; sets `status: ok`, optionally moves album | Photo |
| `bbdiscardinbound` | `{ "photoId" }` | uploader only, pending only; deletes R2 + rows | `{ "ok": true, "id" }` |
| `bbsetinboundauto` | `{ "on": true\|false }` | "Post mine automatically": while on, this fellow's Slack/SMS photos are stored with `status: ok` (no review list). Reported back in `load().inbound.autoPost`. | `{ "autoPost": bool }` |

`photoUrl(id, {size})` in the contract is client-side: it is just `/photos/<id>?size=<size>`.

### `GET /photos/:id?size=thumb|full|orig`

* `thumb` (default): `thumb/<id>.jpg`. If the photo has no thumb (inbound Slack/SMS photos), the
  original is served instead (`x-bb-size: orig` header tells the client; it may generate a thumb
  locally and keep it in memory. There is no "upload a thumb later" endpoint in this reference; add
  one or generate thumbs with the IMAGES binding if the DEV team wants persistent inbound thumbs).
* `full`: 1600px JPEG via the Cloudflare `IMAGES` binding when configured; otherwise the original.
* `orig`: untouched bytes, `Content-Disposition: attachment; filename="<original filename>"`.

Responses carry `ETag` + `Cache-Control: private, max-age=86400`; `If-None-Match` → 304. The route
is not session-gated (so `<img>` works); ids are unguessable uuids. Unknown id → 404.

---

## Local run

```bash
cd worker
cp .dev.vars.example .dev.vars    # local secrets for the hooks
npm run db:init                   # schema.sql + seed.sql into local D1
npm run dev                       # http://localhost:8787  (serves ../public too)
curl -s -X POST localhost:8787/api/bbload -H 'X-Dev-Fellow: f0000000-0000-4000-8000-000000000001' | head -c 400
npm run test:inbound              # signed fake Slack + Twilio deliveries
```

`npm run db:reset` drops and recreates everything.

## Merging into Pulse

1. Run `worker/schema.sql` against Pulse's D1 (all tables are `bb_`-prefixed, no collisions).
2. Add the R2 bucket binding `PHOTOS` and the secrets listed in `wrangler.toml`.
3. Copy `worker/src/bonding.js`, `inbound.js`, `util.js`; mount the route table from
   `worker/src/index.js` (`API` map → `/api/bb*`, `/photos/*`, `/hooks/*`) into Pulse's router.
4. Replace `resolveFellow` in `auth.js` with Pulse's session lookup. Keep `bb_fellows` in sync
   with Pulse's roster (or point the three `bb_fellows` queries at Pulse's own table).
