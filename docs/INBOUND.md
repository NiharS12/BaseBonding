# Inbound photos: Slack and SMS (Twilio)

Fellows can send photos without opening the app. Both channels land in the same place:
`bb_photos` with `source: slack|sms` and `status: pending`, visible only to the sender until they
confirm (or 24 h pass, after which `bbload` auto-accepts them). Originals go to R2 as
`orig/<id>.<ext>`; no thumb is generated (Workers have no canvas), so `thumb_key` is `NULL` and
`GET /photos/:id` serves the original until a client makes a thumb.

## Caption → album rules (both channels)

| caption contains | album |
|---|---|
| `#cohort` | Cohort album (`event_id = null`) |
| `#<slug>` | the event whose slugified title starts with (or contains) the slug, e.g. `#trivia` → "Trivia night at Zeitgeist"; a full or partial event id also works |
| no hashtag | fuzzy: the event within ±3 days of now whose title shares the most words with the caption |
| nothing matches | Cohort album |

The routing hashtag is stripped; the rest of the text becomes the photo's caption. The reply
("Got 2 photos → Lands End hike") names the album; the sender can move the photo when confirming
in-app (`bbconfirminbound` with `eventId`).

## Identity

Senders are matched to fellows via `bb_inbound_identities` (`channel`, `external_id` → `fellow_id`):

* **Slack**: cached mapping; else `users.info` (needs `users:read.email`) and match `bb_fellows.email`;
  else, if the message text contains an email on the roster, link it and reply "Linked you to …".
  Unmatched senders who post images get an ephemeral "Reply with your Pulse email" message
  (a DM when the app is messaged directly).
* **SMS**: cached mapping; else `From` vs `bb_fellows.phone` (digits compared, leading US `1`
  dropped); else the body is scanned for an email on the roster. Unmatched numbers get a TwiML
  reply asking for the Pulse email.

## Pending flow in the app

`bbload` returns the caller's own `pending` photos (others never see them). The module shows them
as "New from Slack/SMS: keep or discard?" with an album picker:

* `POST /api/bbconfirminbound { photoId, eventId? }` → `status: ok`
* `POST /api/bbdiscardinbound { photoId }` → deleted (R2 + rows)
* no action for 24 h → auto-accepted into the routed album

## Environment

| name | where | used by |
|---|---|---|
| `SLACK_SIGNING_SECRET` | secret | verifies `X-Slack-Signature` on `/hooks/slack` (required; 503 `not_configured` without it) |
| `SLACK_BOT_TOKEN` | secret | downloads `url_private_download`, `users.info`, `chat.postEphemeral`/`chat.postMessage` replies. Optional: without it, files are fetched unauthenticated (works only for the local test) and no replies are sent |
| `TWILIO_AUTH_TOKEN` | secret | verifies `X-Twilio-Signature` on `/hooks/twilio` (required); basic-auth fallback for protected media URLs |
| `INBOUND_SLACK_CHANNEL` | `[vars]` | shown in the app's "Send photos from Slack or text" card |
| `INBOUND_SMS_NUMBER` | `[vars]` | same (the Twilio number, E.164) |

Local: copy `worker/.dev.vars.example` to `worker/.dev.vars`. Production:
`npx wrangler secret put SLACK_SIGNING_SECRET` (and the others).

## Slack app setup

1. https://api.slack.com/apps → **Create New App** → From scratch, pick the Claude Corps workspace.
2. **OAuth & Permissions → Bot Token Scopes**: `files:read`, `users:read`, `users:read.email`,
   `chat:write`, `channels:history`, `groups:history`, `im:history`.
3. **Event Subscriptions**: enable, Request URL `https://<worker host>/hooks/slack` (the worker
   answers the `url_verification` challenge; it must be deployed first). Subscribe to bot events
   `message.channels`, `message.groups`, `message.im`.
4. **Install to Workspace**; copy the Bot User OAuth Token → `SLACK_BOT_TOKEN`; **Basic
   Information → Signing Secret** → `SLACK_SIGNING_SECRET`.
5. Invite the bot to the photo channel (`/invite @Basecamp Bonding` in `#cohort-photos`) and set
   `INBOUND_SLACK_CHANNEL` to that channel's name.

What the handler does: verifies the signature (HMAC-SHA256 of `v0:<ts>:<body>`, 5-minute window),
ignores retries (`X-Slack-Retry-Num`), bots and edits, takes every `files[]` entry with an
`image/*` mimetype from a `message` event, downloads it with the bot token, stores it, and replies
with the album. The response is `{ ok, stored, photoIds, album, eventId, failed }` (or
`{ ok, skipped }`).

## Twilio setup

1. Buy a number with MMS (US numbers support it; A2P 10DLC registration is needed for production
   traffic in the US).
2. Phone Numbers → the number → **Messaging → A message comes in**: Webhook,
   `https://<worker host>/hooks/twilio`, HTTP POST.
3. Console → **Auth Token** → `TWILIO_AUTH_TOKEN`. Set `INBOUND_SMS_NUMBER` to the number.

What the handler does: verifies `X-Twilio-Signature` (base64 HMAC-SHA1 of the exact request URL
plus the sorted POST params, so the configured webhook URL must match what the Worker sees; behind
a proxy that rewrites host/scheme, rebuild the URL from `X-Forwarded-*` in `handleTwilio`), reads
`NumMedia`, `MediaUrl{N}`, `MediaContentType{N}`, `Body` and `From`, fetches each image (basic auth
with `AccountSid:AuthToken` if the media URL returns 401), stores, and answers with TwiML:
`Got N photo(s) → <album>`.

## Testing locally

`npm run test:inbound` (with `wrangler dev` running) posts a signed `url_verification`, a signed
Slack `message` with an image file (sender `U0TESTADA`, pre-linked to Ada in `seed.sql`; the image
is served by a throwaway local `python3 -m http.server`), a signed Twilio MMS from Ada's seeded
phone, two bad-signature requests (expect 401) and an unknown number (expect the email prompt),
then lists Ada's pending photos from `bbload`. Signatures are computed with `openssl dgst` using
the values in `.dev.vars`, so the script doubles as a worked example of both signing schemes.

## Skipping the review list

Each fellow can turn on **Post mine automatically** (the switch on the "Send photos from Slack or text" card; `POST /api/bbsetinboundauto { on: true }`, column `bb_fellows.inbound_auto`). While it is on, their inbound photos are stored with `status: ok` and the Slack/SMS reply says "Posted to the album". Otherwise photos wait as `pending` for the sender, who can confirm one at a time or tap **Post all**; anything still pending after 24 h is accepted into the album it was routed to on the next `bbload`.

## Free setup (no Twilio subscription)

Pulse already runs on Cloudflare, and the cohort already has Slack, so two of the three channels cost nothing:

1. **Slack**: already free. Fellows share a photo to the cohort channel from the phone's share sheet.
2. **Email (Cloudflare Email Routing)**: free on any zone. In the Cloudflare dashboard → Email → Email Routing, create an address such as `photos@basecamppulse.com` and set its action to **Send to a Worker** → this Worker. Set `INBOUND_EMAIL` in `wrangler.toml` to that address. The Worker's `email()` handler (`src/inbound.js`, `handleEmail`) parses the message with `postal-mime`, matches the sender to the roster by email, routes by `#event-name` in the subject or body, and stores every image attachment. Unknown senders get a bounce explaining why; no `send_email` binding is needed.
3. **Texting without Twilio**: create a free **Google Voice** number, turn on *Settings → Messages → Forward messages to email*, and in that Gmail add a filter that forwards mail from `txt.voice.google.com` to `INBOUND_EMAIL`. An MMS to the Google Voice number then arrives at the Worker as an email with the photo attached and the sender's number in the subject (`New MMS from (415) 555-0199`); the handler matches that number to `bb_fellows.phone` and files the photo exactly like a Twilio MMS. Set `INBOUND_SMS_NUMBER` to the Google Voice number so the contact card and "Text it" button use it. Google Voice is for personal US accounts and its terms expect personal use; Twilio (`/hooks/twilio`) remains the supported path if that is a concern.

**The contact card.** `GET /bonding/contact.vcf` serves a vCard with the number and email; the module's "Save the contact" sheet also encodes it in a QR. Once saved, fellows on iPhone or Android share photos from the camera roll to "Basecamp Bonding Photos" in Messages or Mail. On iPhone, opening the .vcf shows *Create New Contact*; the QR scanned with the Camera app offers *Add to Contacts*.

Local test of the email path:

```bash
npx wrangler dev --port 8787 --var INBOUND_EMAIL:photos@basecamppulse.com
curl -X POST "http://localhost:8787/cdn-cgi/handler/email?from=ada.okafor@example.org&to=photos@basecamppulse.com" \
  -H "content-type: message/rfc822" --data-binary @message.eml   # needs Message-ID and Date headers
```
