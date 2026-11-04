-- Demo data for `wrangler dev`. Re-runnable (INSERT OR REPLACE).
-- Dev auth: send `X-Dev-Fellow: <id>` (or `Authorization: Bearer dev:<id>`) with one of the ids below.
-- Times are UTC; the PT labels are what the module will show (PST, UTC-8, after Nov 1 2026).

INSERT OR REPLACE INTO bb_fellows (id, name, email, phone, photo_url, host_org, city, role) VALUES
 ('f0000000-0000-4000-8000-000000000001', 'Ada Okafor',     'ada.okafor@example.org',     '+14155550101', NULL, 'Sample Org',            'Sample Location', 'fellow'),
 ('f0000000-0000-4000-8000-000000000002', 'Ben Castillo',   'ben.castillo@example.org',   '+14155550102', NULL, 'Harbor Food Network',   'Oakland, CA',     'fellow'),
 ('f0000000-0000-4000-8000-000000000003', 'Chloe Nguyen',   'chloe.nguyen@example.org',   '+14155550103', NULL, 'Open Courts Lab',       'Denver, CO',      'fellow'),
 ('f0000000-0000-4000-8000-000000000004', 'Dev Raman',      'dev.raman@example.org',      '+14155550104', NULL, 'Bright Futures Tutoring','Atlanta, GA',    'fellow'),
 ('f0000000-0000-4000-8000-000000000005', 'Elena Petrova',  'elena.petrova@example.org',  '+14155550105', NULL, 'Riverside Health Access','Portland, OR',   'fellow'),
 ('f0000000-0000-4000-8000-000000000006', 'Femi Adeyemi',   'femi.adeyemi@example.org',   '+14155550106', NULL, 'Veterans Bridge',       'Austin, TX',      'fellow'),
 ('f0000000-0000-4000-8000-000000000007', 'Grace Lindqvist','grace.lindqvist@example.org','+14155550107', NULL, 'Northside Credit Union','Minneapolis, MN', 'fellow'),
 ('f0000000-0000-4000-8000-000000000008', 'Hugo Martins',   'hugo.martins@example.org',   '+14155550108', NULL, 'Basecamp Pulse',        'San Francisco, CA','staff');

INSERT OR REPLACE INTO bb_events (id, title, description, starts_at, ends_at, location, location_url, host_id, checkin_token, cancelled, created_at, updated_at) VALUES
 -- upcoming: Wed Nov 4 2026, 8:00pm PT
 ('e0000000-0000-4000-8000-000000000001', 'Trivia night at Zeitgeist', 'Teams of 4, first round starts at 8:15. Loser team buys fries.', '2026-11-05T04:00:00Z', '2026-11-05T06:30:00Z', 'Zeitgeist, 199 Valencia St', 'https://maps.apple.com/?q=Zeitgeist+Valencia', 'f0000000-0000-4000-8000-000000000001', 'seedtok-trivia-01', 0, '2026-11-01T18:00:00Z', '2026-11-01T18:00:00Z'),
 -- upcoming: Fri Nov 6 2026, 6:30pm PT
 ('e0000000-0000-4000-8000-000000000002', 'Dumplings + board games', 'Dinner first, then Codenames and Catan at Hugo''s place.', '2026-11-07T02:30:00Z', '2026-11-07T06:00:00Z', 'Hugo''s, Mission (address in Slack)', NULL, 'f0000000-0000-4000-8000-000000000008', 'seedtok-dumpl-02', 0, '2026-11-02T01:00:00Z', '2026-11-02T01:00:00Z'),
 -- upcoming: Sun Nov 8 2026, 11:00am PT
 ('e0000000-0000-4000-8000-000000000003', 'Lands End hike', 'Easy coastal loop, ~2h. Meet at the Lands End Lookout parking lot. Coffee after at Sutro Baths.', '2026-11-08T19:00:00Z', '2026-11-08T22:00:00Z', 'Lands End Lookout', 'https://maps.apple.com/?q=Lands+End+Lookout', 'f0000000-0000-4000-8000-000000000003', 'seedtok-hike-03', 0, '2026-11-02T17:00:00Z', '2026-11-02T17:00:00Z'),
 -- past: Sun Nov 1 2026, 5:00pm PT
 ('e0000000-0000-4000-8000-000000000004', 'Dolores Park picnic', 'Bring a blanket and one thing to share.', '2026-11-02T01:00:00Z', '2026-11-02T04:00:00Z', 'Dolores Park, upper lawn', 'https://maps.apple.com/?q=Dolores+Park', 'f0000000-0000-4000-8000-000000000002', 'seedtok-picnic-04', 0, '2026-10-28T16:00:00Z', '2026-10-28T16:00:00Z'),
 -- past: Thu Oct 29 2026, 7:00pm PT (PDT)
 ('e0000000-0000-4000-8000-000000000005', 'Karaoke at Pandora', 'Private room booked under "Claude Corps". Two hours, BYO courage.', '2026-10-30T02:00:00Z', '2026-10-30T04:00:00Z', 'Pandora Karaoke, 50 Mason St', 'https://maps.apple.com/?q=Pandora+Karaoke', 'f0000000-0000-4000-8000-000000000005', 'seedtok-karaoke-05', 0, '2026-10-25T20:00:00Z', '2026-10-25T20:00:00Z');

INSERT OR REPLACE INTO bb_event_invites (event_id, fellow_id) VALUES
 ('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002'),
 ('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000003'),
 ('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000004'),
 ('e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001'),
 ('e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000005'),
 ('e0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000006'),
 ('e0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000007');

INSERT OR REPLACE INTO bb_rsvps (event_id, fellow_id, status) VALUES
 ('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'going'),
 ('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'going'),
 ('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000003', 'maybe'),
 ('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000004', 'going'),
 ('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000006', 'no'),
 ('e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000008', 'going'),
 ('e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'going'),
 ('e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000005', 'maybe'),
 ('e0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000003', 'going'),
 ('e0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000006', 'going'),
 ('e0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000007', 'going'),
 ('e0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000002', 'going'),
 ('e0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000001', 'going'),
 ('e0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000004', 'going'),
 ('e0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000007', 'going'),
 ('e0000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000005', 'going'),
 ('e0000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000003', 'going'),
 ('e0000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000006', 'going');

-- Past-event attendance: picnic (host Ben confirmed three; Grace claimed late and is pending), karaoke (QR check-ins).
INSERT OR REPLACE INTO bb_attendance (event_id, fellow_id, status, via, late, created_at, confirmed_at) VALUES
 ('e0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000002', 'confirmed', 'host', 0, '2026-11-02T01:05:00Z', '2026-11-02T01:05:00Z'),
 ('e0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000001', 'confirmed', 'host', 0, '2026-11-02T01:10:00Z', '2026-11-02T03:00:00Z'),
 ('e0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000004', 'confirmed', 'host', 0, '2026-11-02T01:12:00Z', '2026-11-02T03:00:00Z'),
 ('e0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000007', 'pending',   'tap',  1, '2026-11-04T15:00:00Z', NULL),
 ('e0000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000005', 'confirmed', 'host', 0, '2026-10-30T02:00:00Z', '2026-10-30T02:00:00Z'),
 ('e0000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000003', 'confirmed', 'qr',   0, '2026-10-30T02:14:00Z', '2026-10-30T02:14:00Z'),
 ('e0000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000006', 'claimed',   'tap',  0, '2026-10-30T02:20:00Z', NULL);

-- One vouch so far for Grace's late picnic claim (needs 2).
INSERT OR REPLACE INTO bb_vouches (event_id, fellow_id, voucher_id, created_at) VALUES
 ('e0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000007', 'f0000000-0000-4000-8000-000000000001', '2026-11-04T15:30:00Z');

INSERT OR REPLACE INTO bb_comments (id, target_type, target_id, fellow_id, text, created_at, deleted) VALUES
 ('c0000000-0000-4000-8000-000000000001', 'event', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'Team name suggestion: Context Window Licking Good', '2026-11-03T22:10:00Z', 0),
 ('c0000000-0000-4000-8000-000000000002', 'event', 'e0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000006', 'Forecast says fog until noon, bring a layer.', '2026-11-04T03:40:00Z', 0);

INSERT OR REPLACE INTO bb_reactions (target_type, target_id, fellow_id, emoji, created_at) VALUES
 ('event', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000003', '🔥', '2026-11-03T20:00:00Z'),
 ('event', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000004', '🔥', '2026-11-03T20:05:00Z'),
 ('event', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000006', '😂', '2026-11-03T21:00:00Z'),
 ('event', 'e0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000007', '🙌', '2026-11-04T01:00:00Z'),
 ('event', 'e0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000001', '❤️', '2026-11-02T05:00:00Z'),
 ('comment', 'c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', '😂', '2026-11-03T22:15:00Z');

-- A pre-linked Slack identity so scripts/test-inbound.sh can post as Ada without a real bot token.
INSERT OR REPLACE INTO bb_inbound_identities (channel, external_id, fellow_id, created_at) VALUES
 ('slack', 'U0TESTADA', 'f0000000-0000-4000-8000-000000000001', '2026-11-01T00:00:00Z');

-- Every seeded event gets a 6-digit host passcode (createEvent/newCheckinCode do this in code).
UPDATE bb_events SET checkin_pin = printf('%06d', abs(random()) % 1000000) WHERE checkin_pin IS NULL;
