# Basecamp Bonding

A fifth tab for [Basecamp Pulse](https://basecamppulse.com) (Claude Corps · Cohort 1): team bonding events on a shared live calendar, "I was there" attendance that can be verified, and cohort / per-event photo albums with tags, reactions and comments. Built the same way as the Connect tab (CorpsConnect): one plain-JavaScript module, no framework, no build step, mounted by a thin adapter that talks to Pulse's API.

```
BasecampBonding.mount(el, { api, qrBase })
```

## What's in it

**Events**
- Propose an event: what, when, where (with a map link), details, and who it's with (tag fellows from the roster).
- Week strip with dots on days that have plans; Upcoming / Past tabs; tap a day to filter.
- RSVP Going / Maybe / Can't, reactions (🔥 ❤️ 😂 👏 🙌), and comments on every event.
- Live: the module polls every 15 s (5 s around a live event), so every phone sees new events, RSVPs and comments within seconds. Writes are optimistic.

**Attendance ("I was there")**
- From 30 min before start until 48 h after the end, a fellow taps "I was there"; the host confirms or removes.
- The host's check-in sheet shows a QR code (scan → `#bb-checkin-<code>` → confirmed) and a random 6-digit passcode fellows can type instead. "Get a new code" rotates both.
- Late claims (any time later) need one proof: tag yourself in a photo from that event (verifies instantly), enter the host's passcode, the host confirms, or two confirmed attendees vouch. Pending claims never count.

**Photos**
- Cohort album, one album per event, and a "Tagged" view of every photo you're in. Tag people, react, comment, caption, move a photo between albums, delete your own (hosts can remove from their event).
- Originals are stored untouched (up to 25 MB) with a 400 px thumb for the grid. The time the photo was taken is read from EXIF on upload, albums sort by it, and downloads carry the caption (EXIF + IPTC, what the Photos app shows as Caption) and the taken-date back into the file, without re-encoding a pixel.
- Download the original from the lightbox, or "Download all" / "Download · N new" (everything added since your last download of that album) per album. On phones the Web Share API hands the files to the share sheet, where "Save Image" puts them straight into the Photos library; laptops get a zip.
- Send photos in from Slack (post in the cohort channel, add `#event-name` to file it) or by text (Twilio MMS). They land in the sender's review list (with a one-tap "Post all"), or go straight into the album when the fellow turns on "Post mine automatically".

**Look**: Pulse's light theme and Poppins, white cards, one honey-mustard accent, bottom sheets on phones, the same avatar style and roster as the Connect tab.

## Try it

No backend needed:

```bash
cd public && python3 -m http.server 8790
```

Open http://localhost:8790. The page runs on an in-browser mock (localStorage + BroadcastChannel): open it in two tabs as two different fellows ("You are" in the demo bar) to watch the calendar update live. "Simulate a Slack photo" shows the inbound flow.

With the reference backend (Cloudflare Worker, local D1 + R2):

```bash
cd worker
cp .dev.vars.example .dev.vars
npm run db:init
npx wrangler dev --port 8787
```

Open http://localhost:8787: the same page, now talking to the Worker. `npm run test:inbound` posts signed Slack and Twilio webhooks at it.

## Repo layout

```
public/index.html              demo shell that looks like Pulse (header, 5-tab switch, demo bar)
public/bonding/
  basecampbonding.js           the module (classes bb-*, variables --bb-*)
  basecampbonding.css
  shape.js                     wire ↔ module translation (ISO dates ↔ ms), shared by the adapters
  worker-api.js                api client for the reference Worker (demo)
  mock-api.js                  in-browser api for the no-backend demo
  qr.js                        Pulse's own QR encoder (already in Pulse as /connect/qr.js)
pulse-adapter/
  bonding.js                   drop into Pulse's public/js/: maps the api to API.call('bb…')
  index.html.patch.md          the four edits Pulse needs (tab button, pane, 5-column switch, import)
worker/
  wrangler.toml, schema.sql, seed.sql, src/{index,bonding,inbound,auth,util}.js, scripts/test-inbound.sh
docs/
  API.md                       every endpoint, shapes, error codes
  INBOUND.md                   Slack app + Twilio setup, caption rules, the pending flow
```

## Integrating into Pulse

See [pulse-adapter/index.html.patch.md](pulse-adapter/index.html.patch.md). In short: copy `public/bonding/` and `pulse-adapter/bonding.js` in, add the fifth tab, merge the Worker handlers and run `schema.sql`, and swap `resolveFellow()` in `worker/src/auth.js` for Pulse's session lookup. The roster (`bb_fellows`) should mirror Pulse's, ids and card photos included, so avatars match Connect.

## Status

Verified locally: the whole module against the mock and against the Worker (events, RSVP, reactions, comments, attendance window, host confirm, QR and passcode check-in, late claims, uploads with thumbs, albums, tagging, captions, downloads with metadata, inbound webhooks with valid signatures). Not yet exercised: real Slack / Twilio traffic (needs the app credentials, see `docs/INBOUND.md`), the Cloudflare Images binding for mid-size renditions, and "Save to Photos" on a physical iPhone.
