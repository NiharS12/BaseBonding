-- Basecamp Bonding: D1 schema. All ids are TEXT uuids; all timestamps are ISO-8601 UTC strings.
-- Idempotent: safe to run again.

-- Roster. In Pulse this is the fellows list the app already has; the reference worker keeps
-- its own copy so `wrangler dev` works standalone (seed.sql fills it).
CREATE TABLE IF NOT EXISTS bb_fellows (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,             -- E.164 preferred; matched by digits for inbound SMS
  photo_url  TEXT,             -- the CorpsConnect card photo, so avatars match the Connect tab
  host_org   TEXT,             -- CorpsConnect card: host organization   } shown under the name,
  city       TEXT,             -- CorpsConnect card: where they're based } "host_org · city", like Connect's list
  role       TEXT,             -- e.g. 'fellow' | 'staff'
  inbound_auto INTEGER NOT NULL DEFAULT 0   -- 1 = Slack/SMS photos post straight into the album, no review list
);
CREATE INDEX IF NOT EXISTS bb_fellows_email ON bb_fellows (email);

CREATE TABLE IF NOT EXISTS bb_events (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT,
  starts_at     TEXT NOT NULL,
  ends_at       TEXT NOT NULL,
  location      TEXT,
  location_url  TEXT,
  host_id       TEXT NOT NULL REFERENCES bb_fellows(id),
  checkin_token TEXT,          -- current QR check-in token (rotated by newCheckinCode)
  checkin_pin TEXT,            -- current 6-digit passcode the host reads out (rotated with the token)
  cancelled     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bb_events_starts ON bb_events (starts_at);
CREATE INDEX IF NOT EXISTS bb_events_host ON bb_events (host_id);

CREATE TABLE IF NOT EXISTS bb_event_invites (
  event_id  TEXT NOT NULL REFERENCES bb_events(id) ON DELETE CASCADE,
  fellow_id TEXT NOT NULL REFERENCES bb_fellows(id),
  PRIMARY KEY (event_id, fellow_id)
);
CREATE INDEX IF NOT EXISTS bb_event_invites_fellow ON bb_event_invites (fellow_id);

CREATE TABLE IF NOT EXISTS bb_rsvps (
  event_id  TEXT NOT NULL REFERENCES bb_events(id) ON DELETE CASCADE,
  fellow_id TEXT NOT NULL REFERENCES bb_fellows(id),
  status    TEXT NOT NULL CHECK (status IN ('going','maybe','no')),
  PRIMARY KEY (event_id, fellow_id)
);
CREATE INDEX IF NOT EXISTS bb_rsvps_fellow ON bb_rsvps (fellow_id);

CREATE TABLE IF NOT EXISTS bb_attendance (
  event_id     TEXT NOT NULL REFERENCES bb_events(id) ON DELETE CASCADE,
  fellow_id    TEXT NOT NULL REFERENCES bb_fellows(id),
  status       TEXT NOT NULL CHECK (status IN ('claimed','confirmed','pending','denied')),
  via          TEXT NOT NULL CHECK (via IN ('tap','host','qr','code','photo','vouch')),
  late         INTEGER NOT NULL DEFAULT 0,   -- 1 = claimed after the 48h window
  created_at   TEXT NOT NULL,
  confirmed_at TEXT,
  PRIMARY KEY (event_id, fellow_id)
);
CREATE INDEX IF NOT EXISTS bb_attendance_fellow ON bb_attendance (fellow_id);

CREATE TABLE IF NOT EXISTS bb_vouches (
  event_id   TEXT NOT NULL REFERENCES bb_events(id) ON DELETE CASCADE,
  fellow_id  TEXT NOT NULL,                  -- the person being vouched for
  voucher_id TEXT NOT NULL,                  -- a confirmed attendee
  created_at TEXT NOT NULL,
  UNIQUE (event_id, fellow_id, voucher_id)
);

CREATE TABLE IF NOT EXISTS bb_photos (
  id           TEXT PRIMARY KEY,
  event_id     TEXT REFERENCES bb_events(id) ON DELETE SET NULL,   -- NULL = cohort album
  uploader_id  TEXT NOT NULL REFERENCES bb_fellows(id),
  orig_key     TEXT NOT NULL,                -- R2: orig/<id>.<ext>  (untouched upload)
  thumb_key    TEXT,                         -- R2: thumb/<id>.jpg   (NULL for inbound photos)
  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL,
  bytes        INTEGER NOT NULL,
  width        INTEGER,
  height       INTEGER,
  caption      TEXT,
  taken_at     TEXT,                         -- when the photo was taken (EXIF DateTimeOriginal: read by the Worker from the file, or sent by the client); NULL = unknown
  lat          REAL,                         -- EXIF GPS, read by the Worker from the file for every source; NULL = the file has none
  lng          REAL,                         --   (the original file in R2 keeps the GPS block itself, so downloads carry it back into Photos)
  source       TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app','slack','sms','email')),
  status       TEXT NOT NULL DEFAULT 'ok'  CHECK (status IN ('ok','pending')),
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bb_photos_event ON bb_photos (event_id);
CREATE INDEX IF NOT EXISTS bb_photos_uploader ON bb_photos (uploader_id);
CREATE INDEX IF NOT EXISTS bb_photos_status ON bb_photos (status, created_at);

CREATE TABLE IF NOT EXISTS bb_photo_tags (
  photo_id  TEXT NOT NULL REFERENCES bb_photos(id) ON DELETE CASCADE,
  fellow_id TEXT NOT NULL REFERENCES bb_fellows(id),
  PRIMARY KEY (photo_id, fellow_id)
);
CREATE INDEX IF NOT EXISTS bb_photo_tags_fellow ON bb_photo_tags (fellow_id);

CREATE TABLE IF NOT EXISTS bb_reactions (
  target_type TEXT NOT NULL CHECK (target_type IN ('event','photo','comment')),
  target_id   TEXT NOT NULL,
  fellow_id   TEXT NOT NULL REFERENCES bb_fellows(id),
  emoji       TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE (target_type, target_id, fellow_id, emoji)
);
CREATE INDEX IF NOT EXISTS bb_reactions_target ON bb_reactions (target_type, target_id);

CREATE TABLE IF NOT EXISTS bb_comments (
  id          TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('event','photo')),
  target_id   TEXT NOT NULL,
  fellow_id   TEXT NOT NULL REFERENCES bb_fellows(id),
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS bb_comments_target ON bb_comments (target_type, target_id, deleted);
CREATE INDEX IF NOT EXISTS bb_comments_fellow ON bb_comments (fellow_id, created_at);

-- Who is who on Slack / SMS. Filled automatically (email / phone match) or by the
-- "reply with your Pulse email" flow.
CREATE TABLE IF NOT EXISTS bb_inbound_identities (
  channel     TEXT NOT NULL CHECK (channel IN ('slack','sms','email')),
  external_id TEXT NOT NULL,                 -- Slack user id (U…) or E.164 phone
  fellow_id   TEXT NOT NULL REFERENCES bb_fellows(id),
  created_at  TEXT NOT NULL,
  PRIMARY KEY (channel, external_id)
);
CREATE INDEX IF NOT EXISTS bb_inbound_identities_fellow ON bb_inbound_identities (fellow_id);
