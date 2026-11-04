// Basecamp Bonding: API handlers. Each handler gets `{ env, me, request, body }` and returns
// plain JSON. Business rules live here; the router (index.js) and auth (auth.js) stay thin.

import { readExif } from './exif.js';
import { ApiError, uuid, nowIso, extFromType, base64ToBytes, MAX_PHOTO_BYTES, MIN, HOUR } from './util.js';

const EMOJIS = new Set(['🔥', '❤️', '😂', '👏', '🙌']);
const WINDOW_BEFORE = 30 * MIN;   // "I was there" opens 30 min before start
const WINDOW_AFTER = 48 * HOUR;   // ...and closes 48 h after end
const PENDING_AUTO_ACCEPT = 24 * HOUR; // inbound photos auto-accept after 24 h
const VOUCHES_NEEDED = 2;

const q = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
const rows = async (stmt) => (await stmt.all()).results || [];
const requireId = (v, code = 'bad_id') => {
  if (typeof v !== 'string' || !v || v.length > 80) throw new ApiError(code, 400);
  return v;
};
const requireText = (v, max = 2000) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s || s.length > max) throw new ApiError('bad_text', 400);
  return s;
};
const parseIso = (v) => {
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new ApiError('bad_time', 400);
  return new Date(t).toISOString();
};

/* ────────────────────────────── graph loaders ────────────────────────────── */

function groupBy(list, key) {
  const m = new Map();
  for (const r of list) {
    const k = r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

function shapeEvent(e, meId, rel) {
  const vouches = {};
  for (const v of rel.vouches.get(e.id) || []) vouches[v.fellow_id] = (vouches[v.fellow_id] || 0) + 1;
  const out = {
    id: e.id,
    title: e.title,
    description: e.description,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    location: e.location,
    location_url: e.location_url,
    host_id: e.host_id,
    cancelled: !!e.cancelled,
    created_at: e.created_at,
    updated_at: e.updated_at,
    rsvps: (rel.rsvps.get(e.id) || []).map(({ fellow_id, status }) => ({ fellow_id, status })),
    invites: (rel.invites.get(e.id) || []).map((r) => r.fellow_id),
    attendance: (rel.attendance.get(e.id) || []).map(({ fellow_id, status, via, late, created_at, confirmed_at }) => ({
      fellow_id, status, via, late: !!late, created_at, confirmed_at,
    })),
    vouches,
    reactions: (rel.reactions.get('event:' + e.id) || []).map(({ emoji, fellow_id }) => ({ emoji, fellow_id })),
    comments: (rel.comments.get('event:' + e.id) || []).map((c) => shapeComment(c, rel)),
    photoCount: rel.photoCounts.get(e.id) || 0,
  };
  if (e.host_id === meId) { out.checkinToken = e.checkin_token; out.checkinPin = e.checkin_pin; } // host-only: the QR and the 6-digit passcode
  return out;
}

const shapeComment = (c, rel) => ({
  id: c.id,
  target_type: c.target_type,
  target_id: c.target_id,
  fellow_id: c.fellow_id,
  text: c.text,
  created_at: c.created_at,
  reactions: (rel.reactions.get('comment:' + c.id) || []).map(({ emoji, fellow_id }) => ({ emoji, fellow_id })),
});

const shapePhoto = (p, rel) => ({
  id: p.id,
  event_id: p.event_id,
  uploader_id: p.uploader_id,
  filename: p.filename,
  content_type: p.content_type,
  bytes: p.bytes,
  width: p.width,
  height: p.height,
  caption: p.caption,
  taken_at: p.taken_at,
  lat: p.lat,
  lng: p.lng,
  source: p.source,
  status: p.status,
  hasThumb: !!p.thumb_key,
  created_at: p.created_at,
  url: `/photos/${p.id}`,
  tags: (rel.tags.get(p.id) || []).map((t) => t.fellow_id),
  reactions: (rel.reactions.get('photo:' + p.id) || []).map(({ emoji, fellow_id }) => ({ emoji, fellow_id })),
  comments: (rel.comments.get('photo:' + p.id) || []).map((c) => shapeComment(c, rel)),
});

/** Load events (all, or one) with every embedded relation. */
async function loadEvents(env, meId, eventId = null) {
  const w = eventId ? 'WHERE event_id = ?1' : '';
  const [events, rsvps, invites, attendance, vouches, comments, reactions, counts] = (
    await env.DB.batch([
      q(env, `SELECT * FROM bb_events ${eventId ? 'WHERE id = ?1' : ''} ORDER BY starts_at`, ...(eventId ? [eventId] : [])),
      q(env, `SELECT * FROM bb_rsvps ${w}`, ...(eventId ? [eventId] : [])),
      q(env, `SELECT * FROM bb_event_invites ${w}`, ...(eventId ? [eventId] : [])),
      q(env, `SELECT * FROM bb_attendance ${w} ORDER BY created_at`, ...(eventId ? [eventId] : [])),
      q(env, `SELECT * FROM bb_vouches ${w}`, ...(eventId ? [eventId] : [])),
      q(env, `SELECT * FROM bb_comments WHERE target_type = 'event' AND deleted = 0 ${eventId ? 'AND target_id = ?1' : ''} ORDER BY created_at`, ...(eventId ? [eventId] : [])),
      q(env, `SELECT * FROM bb_reactions WHERE (target_type = 'event' ${eventId ? 'AND target_id = ?1' : ''})
                 OR (target_type = 'comment' AND target_id IN (SELECT id FROM bb_comments WHERE target_type = 'event' ${eventId ? 'AND target_id = ?1' : ''}))`, ...(eventId ? [eventId] : [])),
      q(env, `SELECT event_id, COUNT(*) AS n FROM bb_photos WHERE status = 'ok' AND event_id IS NOT NULL ${eventId ? 'AND event_id = ?1' : ''} GROUP BY event_id`, ...(eventId ? [eventId] : [])),
    ])
  ).map((r) => r.results || []);
  const rel = {
    rsvps: groupBy(rsvps, 'event_id'),
    invites: groupBy(invites, 'event_id'),
    attendance: groupBy(attendance, 'event_id'),
    vouches: groupBy(vouches, 'event_id'),
    comments: groupBy(comments.map((c) => ({ ...c, _k: 'event:' + c.target_id })), '_k'),
    reactions: groupBy(reactions.map((r) => ({ ...r, _k: r.target_type + ':' + r.target_id })), '_k'),
    photoCounts: new Map(counts.map((c) => [c.event_id, c.n])),
  };
  return events.map((e) => shapeEvent(e, meId, rel));
}

async function getEvent(env, meId, eventId) {
  const [e] = await loadEvents(env, meId, requireId(eventId));
  if (!e) throw new ApiError('gone', 404);
  return e;
}

/** Load photos visible to `meId` (status ok, plus my own pending), or one photo by id. */
async function loadPhotos(env, meId, photoId = null) {
  const where = photoId
    ? `WHERE p.id = ?1`
    : `WHERE p.status = 'ok' OR p.uploader_id = ?1`;
  const arg = photoId || meId;
  const [photos, tags, comments, reactions] = (
    await env.DB.batch([
      q(env, `SELECT p.* FROM bb_photos p ${where} ORDER BY p.created_at DESC`, arg),
      q(env, `SELECT t.* FROM bb_photo_tags t JOIN bb_photos p ON p.id = t.photo_id ${where}`, arg),
      q(env, `SELECT c.* FROM bb_comments c JOIN bb_photos p ON p.id = c.target_id ${where} AND c.target_type = 'photo' AND c.deleted = 0 ORDER BY c.created_at`, arg),
      q(env, `SELECT r.* FROM bb_reactions r WHERE (r.target_type = 'photo' AND r.target_id IN (SELECT p.id FROM bb_photos p ${where}))
                 OR (r.target_type = 'comment' AND r.target_id IN (SELECT c.id FROM bb_comments c JOIN bb_photos p ON p.id = c.target_id ${where} AND c.target_type = 'photo'))`, arg),
    ])
  ).map((r) => r.results || []);
  const rel = {
    tags: groupBy(tags, 'photo_id'),
    comments: groupBy(comments.map((c) => ({ ...c, _k: 'photo:' + c.target_id })), '_k'),
    reactions: groupBy(reactions.map((r) => ({ ...r, _k: r.target_type + ':' + r.target_id })), '_k'),
  };
  return photos.map((p) => shapePhoto(p, rel));
}

async function getPhoto(env, meId, photoId) {
  const [p] = await loadPhotos(env, meId, requireId(photoId));
  if (!p) throw new ApiError('gone', 404);
  return p;
}

async function photoRow(env, photoId) {
  const p = await q(env, 'SELECT * FROM bb_photos WHERE id = ?1', requireId(photoId)).first();
  if (!p) throw new ApiError('gone', 404);
  return p;
}

async function eventRow(env, eventId, { allowCancelled = false } = {}) {
  const e = await q(env, 'SELECT * FROM bb_events WHERE id = ?1', requireId(eventId)).first();
  if (!e || (e.cancelled && !allowCancelled)) throw new ApiError('gone', 404);
  return e;
}

const requireHost = (e, me) => {
  if (e.host_id !== me.id) throw new ApiError('not_host', 403);
};

/* ────────────────────────────────── load ────────────────────────────────── */

export async function load({ env, me }) {
  // Lazy auto-accept of inbound photos the sender never confirmed (24 h).
  await q(env, `UPDATE bb_photos SET status = 'ok' WHERE status = 'pending' AND created_at < ?1`,
    new Date(Date.now() - PENDING_AUTO_ACCEPT).toISOString()).run();

  const [fellows, events, photos] = await Promise.all([
    rows(q(env, 'SELECT id, name, email, phone, photo_url, host_org, city, role FROM bb_fellows ORDER BY name')),
    loadEvents(env, me.id),
    loadPhotos(env, me.id),
  ]);
  return {
    me,
    fellows,
    events,
    photos,
    inbound: { slackChannel: env.INBOUND_SLACK_CHANNEL || '', smsNumber: env.INBOUND_SMS_NUMBER || '', email: env.INBOUND_EMAIL || '', contactUrl: '/bonding/contact.vcf', autoPost: !!(await q(env, 'SELECT inbound_auto FROM bb_fellows WHERE id = ?1', me.id).first())?.inbound_auto },
    features: { verifyAttendance: verifyOn(env) },
    serverTime: nowIso(),
  };
}

/* ───────────────────────────────── events ───────────────────────────────── */

function eventFields(f, existing = {}) {
  const title = f.title !== undefined ? requireText(f.title, 120) : existing.title;
  if (!title) throw new ApiError('bad_text', 400);
  const starts_at = f.starts_at !== undefined ? parseIso(f.starts_at) : existing.starts_at;
  if (!starts_at) throw new ApiError('bad_time', 400);
  let ends_at = f.ends_at !== undefined && f.ends_at !== null ? parseIso(f.ends_at) : existing.ends_at;
  if (!ends_at || f.starts_at !== undefined && f.ends_at === undefined && existing.ends_at === undefined) {
    ends_at = new Date(Date.parse(starts_at) + 2 * HOUR).toISOString();
  }
  if (Date.parse(ends_at) < Date.parse(starts_at)) throw new ApiError('bad_time', 400);
  const str = (k, max) => (f[k] === undefined ? (existing[k] ?? null) : f[k] === null || f[k] === '' ? null : requireText(f[k], max));
  return {
    title,
    description: str('description', 4000),
    starts_at,
    ends_at,
    location: str('location', 200),
    location_url: str('location_url', 500),
  };
}

export async function createEvent({ env, me, body }) {
  const f = body.fields || body;
  const v = eventFields(f);
  const id = uuid();
  const now = nowIso();
  const stmts = [
    q(env, `INSERT INTO bb_events (id, title, description, starts_at, ends_at, location, location_url, host_id, checkin_token, checkin_pin, cancelled, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?11, ?11)`,
      id, v.title, v.description, v.starts_at, v.ends_at, v.location, v.location_url, me.id, newToken(), newPin(), now),
    q(env, `INSERT INTO bb_rsvps (event_id, fellow_id, status) VALUES (?1, ?2, 'going')`, id, me.id),
  ];
  for (const fid of uniqueIds(f.invites || f.invite || [], me.id)) {
    stmts.push(q(env, `INSERT OR IGNORE INTO bb_event_invites (event_id, fellow_id) VALUES (?1, ?2)`, id, fid));
  }
  await env.DB.batch(stmts);
  return getEvent(env, me.id, id);
}

export async function updateEvent({ env, me, body }) {
  const e = await eventRow(env, body.eventId || body.id);
  requireHost(e, me);
  const v = eventFields(body.fields || body, e);
  await q(env, `UPDATE bb_events SET title=?2, description=?3, starts_at=?4, ends_at=?5, location=?6, location_url=?7, updated_at=?8 WHERE id=?1`,
    e.id, v.title, v.description, v.starts_at, v.ends_at, v.location, v.location_url, nowIso()).run();
  return getEvent(env, me.id, e.id);
}

export async function cancelEvent({ env, me, body }) {
  const e = await eventRow(env, body.eventId || body.id, { allowCancelled: true });
  requireHost(e, me);
  await q(env, `UPDATE bb_events SET cancelled = 1, updated_at = ?2 WHERE id = ?1`, e.id, nowIso()).run();
  return getEvent(env, me.id, e.id);
}

export async function rsvp({ env, me, body }) {
  const e = await eventRow(env, body.eventId);
  const status = body.status;
  if (!['going', 'maybe', 'no', 'none'].includes(status)) throw new ApiError('bad_status', 400);
  if (status === 'none') await q(env, `DELETE FROM bb_rsvps WHERE event_id = ?1 AND fellow_id = ?2`, e.id, me.id).run();
  else await q(env, `INSERT OR REPLACE INTO bb_rsvps (event_id, fellow_id, status) VALUES (?1, ?2, ?3)`, e.id, me.id, status).run();
  return getEvent(env, me.id, e.id);
}

function uniqueIds(list, exclude) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((x) => typeof x === 'string' && x && x !== exclude))].slice(0, 200);
}

export async function invite({ env, me, body }) {
  const e = await eventRow(env, body.eventId);
  const ids = uniqueIds(body.fellowIds, null);
  if (ids.length) {
    const known = new Set((await rows(q(env, 'SELECT id FROM bb_fellows'))).map((r) => r.id));
    const stmts = ids.filter((id) => known.has(id)).map((fid) =>
      q(env, `INSERT OR IGNORE INTO bb_event_invites (event_id, fellow_id) VALUES (?1, ?2)`, e.id, fid));
    if (stmts.length) await env.DB.batch(stmts);
  }
  return getEvent(env, me.id, e.id);
}

/* ─────────────────────────────── attendance ─────────────────────────────── */

// Optional, off by default (wrangler.toml VERIFY_ATTENDANCE). Off: "I was there" is a one-tap self-report that counts at once.
const verifyOn = env => String(env.VERIFY_ATTENDANCE || '').toLowerCase() === 'true';

function windowState(e, now = Date.now()) {
  const opens = Date.parse(e.starts_at) - WINDOW_BEFORE;
  const closes = Date.parse(e.ends_at) + WINDOW_AFTER;
  return now < opens ? 'early' : now > closes ? 'closed' : 'open';
}

async function attendanceRow(env, eventId, fellowId) {
  return q(env, `SELECT * FROM bb_attendance WHERE event_id = ?1 AND fellow_id = ?2`, eventId, fellowId).first();
}

async function setAttendance(env, eventId, fellowId, status, via, late, confirmed) {
  const now = nowIso();
  await q(env, `INSERT INTO bb_attendance (event_id, fellow_id, status, via, late, created_at, confirmed_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                ON CONFLICT (event_id, fellow_id) DO UPDATE SET status = excluded.status, via = excluded.via,
                  late = excluded.late, confirmed_at = excluded.confirmed_at`,
    eventId, fellowId, status, via, late ? 1 : 0, now, confirmed ? now : null).run();
}

export async function attend({ env, me, body }) {
  const e = await eventRow(env, body.eventId);
  const state = windowState(e);
  if (state === 'early') throw new ApiError('window_closed', 409);
  const cur = await attendanceRow(env, e.id, me.id);
  if (!verifyOn(env)) {
    // Verification off: counted at once, any time after the window opens; "late" only labels it as added after 48 h.
    if (!cur || cur.status !== 'confirmed') await setAttendance(env, e.id, me.id, 'confirmed', 'tap', state === 'closed', true);
    return getEvent(env, me.id, e.id);
  }
  if (state !== 'open') throw new ApiError('window_closed', 409);
  if (!cur || cur.status === 'denied') await setAttendance(env, e.id, me.id, 'claimed', 'tap', false, false);
  // already claimed/confirmed: idempotent
  return getEvent(env, me.id, e.id);
}

async function taggedInEventPhoto(env, eventId, fellowId, photoId) {
  if (photoId) {
    const hit = await q(env, `SELECT 1 FROM bb_photo_tags t JOIN bb_photos p ON p.id = t.photo_id
                               WHERE t.photo_id = ?1 AND t.fellow_id = ?2 AND p.event_id = ?3 AND p.status = 'ok'`,
      requireId(photoId), fellowId, eventId).first();
    if (hit) return true;
  }
  const any = await q(env, `SELECT 1 FROM bb_photo_tags t JOIN bb_photos p ON p.id = t.photo_id
                             WHERE t.fellow_id = ?1 AND p.event_id = ?2 AND p.status = 'ok' LIMIT 1`, fellowId, eventId).first();
  return !!any;
}

export async function attendLate({ env, me, body }) {
  const e = await eventRow(env, body.eventId);
  const state = windowState(e);
  if (state === 'early') throw new ApiError('window_closed', 409);
  if (state === 'open' || !verifyOn(env)) return attend({ env, me, body }); // inside the window, or verification off: a normal claim
  const cur = await attendanceRow(env, e.id, me.id);
  if (cur && cur.status === 'confirmed') return getEvent(env, me.id, e.id);
  const proven = await taggedInEventPhoto(env, e.id, me.id, body.photoId);
  if (proven) await setAttendance(env, e.id, me.id, 'confirmed', 'photo', true, true);
  else if (!cur || cur.status === 'denied') await setAttendance(env, e.id, me.id, 'pending', 'tap', true, false);
  return getEvent(env, me.id, e.id);
}

export async function confirmAttendance({ env, me, body }) {
  const e = await eventRow(env, body.eventId, { allowCancelled: true });
  requireHost(e, me);
  const fellowId = requireId(body.fellowId);
  const cur = await attendanceRow(env, e.id, fellowId);
  if (!cur) throw new ApiError('gone', 404);
  const ok = body.ok !== false;
  if (ok) {
    if (cur.status !== 'confirmed') await setAttendance(env, e.id, fellowId, 'confirmed', 'host', !!cur.late, true);
  } else if (cur.late) {
    await q(env, `UPDATE bb_attendance SET status = 'denied', confirmed_at = NULL WHERE event_id = ?1 AND fellow_id = ?2`, e.id, fellowId).run();
  } else {
    await q(env, `DELETE FROM bb_attendance WHERE event_id = ?1 AND fellow_id = ?2`, e.id, fellowId).run();
  }
  return getEvent(env, me.id, e.id);
}

export async function vouch({ env, me, body }) {
  const e = await eventRow(env, body.eventId, { allowCancelled: true });
  const fellowId = requireId(body.fellowId);
  if (fellowId === me.id) throw new ApiError('not_allowed', 403);
  const mine = await attendanceRow(env, e.id, me.id);
  if (!mine || mine.status !== 'confirmed') throw new ApiError('not_allowed', 403);
  const target = await attendanceRow(env, e.id, fellowId);
  if (!target) throw new ApiError('gone', 404);
  if (target.status === 'confirmed') throw new ApiError('already', 409);
  const res = await q(env, `INSERT OR IGNORE INTO bb_vouches (event_id, fellow_id, voucher_id, created_at) VALUES (?1, ?2, ?3, ?4)`,
    e.id, fellowId, me.id, nowIso()).run();
  if (!res.meta.changes) throw new ApiError('already', 409);
  const { n } = await q(env, `SELECT COUNT(DISTINCT voucher_id) AS n FROM bb_vouches WHERE event_id = ?1 AND fellow_id = ?2`, e.id, fellowId).first();
  if (n >= VOUCHES_NEEDED) await setAttendance(env, e.id, fellowId, 'confirmed', 'vouch', !!target.late, true);
  return getEvent(env, me.id, e.id);
}

const newToken = () => uuid().replace(/-/g, '').slice(0, 20);
// 6 random digits from crypto, zero-padded. Only ever matched together with its event id, so collisions across events don't matter.
const newPin = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');

export async function newCheckinCode({ env, me, body }) {
  const e = await eventRow(env, body.eventId);
  requireHost(e, me);
  const token = newToken(), pin = newPin();
  await q(env, `UPDATE bb_events SET checkin_token = ?2, checkin_pin = ?3, updated_at = ?4 WHERE id = ?1`, e.id, token, pin, nowIso()).run();
  return { code: `${e.id}-${token}`, pin };
}

export async function checkin({ env, me, body }) {
  // Accepts "<eventId>-<token>" (what the QR encodes after "#bb-checkin-"), "<eventId>-<6-digit pin>" (typed in from the
  // host's screen) or a bare token. A pin is only ever matched together with its event id.
  const raw = String(body.code || '').trim().replace(/^#?bb-checkin-/, '');
  if (!raw || raw.length > 120) throw new ApiError('bad_code', 400);
  const m = raw.match(/^([0-9a-f-]{36})-(.+)$/i);
  const e = m
    ? await q(env, `SELECT * FROM bb_events WHERE id = ?1 AND (checkin_token = ?2 OR checkin_pin = ?2) AND cancelled = 0`, m[1], m[2]).first()
    : await q(env, `SELECT * FROM bb_events WHERE checkin_token = ?1 AND cancelled = 0`, raw).first();
  if (!e) throw new ApiError('bad_code', 404);
  const cur = await attendanceRow(env, e.id, me.id);
  const via = m && m[2] === e.checkin_pin && m[2] !== e.checkin_token ? 'code' : 'qr';
  if (!cur || cur.status !== 'confirmed') await setAttendance(env, e.id, me.id, 'confirmed', via, windowState(e) === 'closed', true);
  return getEvent(env, me.id, e.id);
}

/* ─────────────────────────── reactions & comments ───────────────────────── */

async function targetExists(env, type, id) {
  if (type === 'event') return !!(await q(env, 'SELECT 1 FROM bb_events WHERE id = ?1', id).first());
  if (type === 'photo') return !!(await q(env, 'SELECT 1 FROM bb_photos WHERE id = ?1', id).first());
  if (type === 'comment') return !!(await q(env, 'SELECT 1 FROM bb_comments WHERE id = ?1 AND deleted = 0', id).first());
  return false;
}

async function returnTarget(env, me, type, id) {
  if (type === 'event') return getEvent(env, me.id, id);
  if (type === 'photo') return getPhoto(env, me.id, id);
  const c = await q(env, 'SELECT * FROM bb_comments WHERE id = ?1', id).first();
  if (!c) throw new ApiError('gone', 404);
  // A comment's parent is what the module re-renders.
  return returnTarget(env, me, c.target_type, c.target_id);
}

export async function react({ env, me, body }) {
  const t = body.target || {};
  const type = t.type;
  const id = requireId(t.id);
  if (!['event', 'photo', 'comment'].includes(type)) throw new ApiError('bad_target', 400);
  const emoji = String(body.emoji || '');
  if (!EMOJIS.has(emoji)) throw new ApiError('bad_emoji', 400);
  if (!(await targetExists(env, type, id))) throw new ApiError('gone', 404);
  const existing = await q(env, `SELECT 1 FROM bb_reactions WHERE target_type=?1 AND target_id=?2 AND fellow_id=?3 AND emoji=?4`, type, id, me.id, emoji).first();
  const on = body.on === undefined || body.on === null ? !existing : !!body.on;
  if (on && !existing) await q(env, `INSERT OR IGNORE INTO bb_reactions (target_type, target_id, fellow_id, emoji, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`, type, id, me.id, emoji, nowIso()).run();
  if (!on && existing) await q(env, `DELETE FROM bb_reactions WHERE target_type=?1 AND target_id=?2 AND fellow_id=?3 AND emoji=?4`, type, id, me.id, emoji).run();
  return returnTarget(env, me, type, id);
}

export async function comment({ env, me, body }) {
  const t = body.target || {};
  const type = t.type;
  const id = requireId(t.id);
  if (!['event', 'photo'].includes(type)) throw new ApiError('bad_target', 400);
  const text = requireText(body.text, 1000);
  if (!(await targetExists(env, type, id))) throw new ApiError('gone', 404);
  const { n } = await q(env, `SELECT COUNT(*) AS n FROM bb_comments WHERE fellow_id = ?1 AND created_at > ?2`,
    me.id, new Date(Date.now() - 10_000).toISOString()).first();
  if (n >= 5) throw new ApiError('slow_down', 429);
  // Client-generated id (optional) makes retries idempotent, like PulseAPI.uid.
  const cid = typeof body.id === 'string' && /^[0-9a-f-]{8,40}$/i.test(body.id) ? body.id : uuid();
  await q(env, `INSERT OR IGNORE INTO bb_comments (id, target_type, target_id, fellow_id, text, created_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)`,
    cid, type, id, me.id, text, nowIso()).run();
  return returnTarget(env, me, type, id);
}

export async function deleteComment({ env, me, body }) {
  const id = requireId(body.id || body.commentId);
  const c = await q(env, 'SELECT * FROM bb_comments WHERE id = ?1', id).first();
  if (!c || c.deleted) throw new ApiError('gone', 404);
  let allowed = c.fellow_id === me.id;
  if (!allowed) {
    // the host of the event (directly, or of the event the photo belongs to) may moderate
    const hostId = c.target_type === 'event'
      ? (await q(env, 'SELECT host_id FROM bb_events WHERE id = ?1', c.target_id).first())?.host_id
      : (await q(env, 'SELECT e.host_id FROM bb_photos p JOIN bb_events e ON e.id = p.event_id WHERE p.id = ?1', c.target_id).first())?.host_id;
    allowed = hostId === me.id;
  }
  if (!allowed) throw new ApiError('not_allowed', 403);
  await q(env, 'UPDATE bb_comments SET deleted = 1 WHERE id = ?1', id).run();
  return returnTarget(env, me, c.target_type, c.target_id);
}

/* ────────────────────────────────── photos ──────────────────────────────── */

const isImageType = (t) => /^image\//i.test(t || '');

/**
 * Upload. Multipart (preferred): fields `file` (original bytes, untouched), `thumb` (client-made
 * ~400px JPEG), `eventId`, `caption`, `tags` (JSON array of fellow ids), `width`, `height`.
 * JSON fallback: `{ data: base64, thumb: base64, filename, contentType, eventId, caption, tags, width, height }`.
 */
export async function uploadPhoto({ env, me, request, body }) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_PHOTO_BYTES * 1.4) throw new ApiError('too_big', 413);

  let bytes, thumbBytes = null, filename, contentType, meta = {};
  if (body.form) {
    const form = body.form;
    const file = form.get('file');
    if (!file || typeof file === 'string') throw new ApiError('bad_file', 400);
    if (file.size > MAX_PHOTO_BYTES) throw new ApiError('too_big', 413);
    bytes = new Uint8Array(await file.arrayBuffer());
    filename = file.name || 'photo';
    contentType = file.type || 'application/octet-stream';
    const thumb = form.get('thumb');
    if (thumb && typeof thumb !== 'string') thumbBytes = new Uint8Array(await thumb.arrayBuffer());
    let tags = [];
    try { tags = form.get('tags') ? JSON.parse(form.get('tags')) : []; } catch { throw new ApiError('bad_tags', 400); }
    meta = { eventId: form.get('eventId') || null, caption: form.get('caption') || '', tags, width: form.get('width'), height: form.get('height'), taken_at: form.get('taken_at'), lat: form.get('lat'), lng: form.get('lng') };
  } else {
    if (typeof body.data !== 'string') throw new ApiError('bad_file', 400);
    if (body.data.length > MAX_PHOTO_BYTES * 1.4) throw new ApiError('too_big', 413);
    bytes = base64ToBytes(body.data);
    if (bytes.length > MAX_PHOTO_BYTES) throw new ApiError('too_big', 413);
    if (typeof body.thumb === 'string' && body.thumb) thumbBytes = base64ToBytes(body.thumb);
    filename = body.filename || 'photo';
    contentType = body.contentType || 'application/octet-stream';
    meta = { eventId: body.eventId || null, caption: body.caption || '', tags: body.tags || [], width: body.width, height: body.height, taken_at: body.taken_at, lat: body.lat, lng: body.lng };
  }
  if (!isImageType(contentType)) throw new ApiError('bad_file', 400);
  if (!bytes.length) throw new ApiError('bad_file', 400);

  let eventId = null;
  if (meta.eventId) eventId = (await eventRow(env, meta.eventId)).id;
  const caption = typeof meta.caption === 'string' ? meta.caption.trim().slice(0, 500) : '';
  const tags = uniqueIds(meta.tags, null);
  const width = Number(meta.width) > 0 ? Math.round(Number(meta.width)) : null;
  const height = Number(meta.height) > 0 ? Math.round(Number(meta.height)) : null;
  // When the photo was taken, as read from EXIF on the phone. Kept so albums sort by the moment, not the upload, and so a
  // download can carry the date back into the fellow's camera roll.
  const takenMs = meta.taken_at ? Date.parse(meta.taken_at) : NaN;
  // The file itself is the authority: EXIF date and GPS read here, so the metadata is indexed however the photo arrived.
  const ex = readExif(bytes, { timeZone: env.PLAN_TIMEZONE || 'UTC' });
  const takenAt = Number.isFinite(takenMs) && takenMs > 0 && takenMs < Date.now() + 86400e3 ? new Date(takenMs).toISOString() : ex.taken_at;
  const lat = ex.lat ?? (Number.isFinite(Number(meta.lat)) && meta.lat !== '' && meta.lat != null ? Number(meta.lat) : null);
  const lng = ex.lng ?? (Number.isFinite(Number(meta.lng)) && meta.lng !== '' && meta.lng != null ? Number(meta.lng) : null);
  const w = width || ex.width, hgt = height || ex.height;

  const id = uuid();
  const origKey = `orig/${id}.${extFromType(contentType, filename)}`;
  const thumbKey = thumbBytes && thumbBytes.length ? `thumb/${id}.jpg` : null;
  await env.PHOTOS.put(origKey, bytes, { httpMetadata: { contentType }, customMetadata: { filename: String(filename).slice(0, 200), uploader: me.id } });
  if (thumbKey) await env.PHOTOS.put(thumbKey, thumbBytes, { httpMetadata: { contentType: 'image/jpeg' } });

  const stmts = [
    q(env, `INSERT INTO bb_photos (id, event_id, uploader_id, orig_key, thumb_key, filename, content_type, bytes, width, height, caption, taken_at, lat, lng, source, status, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?14, ?15, 'app', 'ok', ?13)`,
      id, eventId, me.id, origKey, thumbKey, String(filename).slice(0, 200), contentType, bytes.length, w, hgt, caption || null, takenAt, nowIso(), lat, lng),
  ];
  for (const fid of tags) stmts.push(q(env, `INSERT OR IGNORE INTO bb_photo_tags (photo_id, fellow_id) VALUES (?1, ?2)`, id, fid));
  await env.DB.batch(stmts);
  return getPhoto(env, me.id, id);
}

async function canManagePhoto(env, me, p) {
  if (p.uploader_id === me.id) return true;
  if (!p.event_id) return false;
  const e = await q(env, 'SELECT host_id FROM bb_events WHERE id = ?1', p.event_id).first();
  return !!e && e.host_id === me.id;
}

/** caption / eventId: uploader or host of the photo's event. tags: any fellow (tagging people is social). */
export async function updatePhoto({ env, me, body }) {
  const p = await photoRow(env, body.photoId || body.id);
  const f = body.fields || body;
  const stmts = [];
  if (f.caption !== undefined || f.eventId !== undefined) {
    if (!(await canManagePhoto(env, me, p))) throw new ApiError('not_allowed', 403);
    if (f.caption !== undefined) stmts.push(q(env, 'UPDATE bb_photos SET caption = ?2 WHERE id = ?1', p.id, f.caption ? String(f.caption).trim().slice(0, 500) : null));
    if (f.eventId !== undefined) {
      const eid = f.eventId ? (await eventRow(env, f.eventId)).id : null;
      stmts.push(q(env, 'UPDATE bb_photos SET event_id = ?2 WHERE id = ?1', p.id, eid));
    }
  }
  if (f.tags !== undefined) {
    const tags = uniqueIds(f.tags, null);
    stmts.push(q(env, 'DELETE FROM bb_photo_tags WHERE photo_id = ?1', p.id));
    for (const fid of tags) stmts.push(q(env, 'INSERT OR IGNORE INTO bb_photo_tags (photo_id, fellow_id) VALUES (?1, ?2)', p.id, fid));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return getPhoto(env, me.id, p.id);
}

async function removePhoto(env, p) {
  await Promise.all([env.PHOTOS.delete(p.orig_key), p.thumb_key ? env.PHOTOS.delete(p.thumb_key) : null]);
  await env.DB.batch([
    q(env, 'DELETE FROM bb_photo_tags WHERE photo_id = ?1', p.id),
    q(env, `DELETE FROM bb_reactions WHERE (target_type = 'photo' AND target_id = ?1)
            OR (target_type = 'comment' AND target_id IN (SELECT id FROM bb_comments WHERE target_type = 'photo' AND target_id = ?1))`, p.id),
    q(env, `DELETE FROM bb_comments WHERE target_type = 'photo' AND target_id = ?1`, p.id),
    q(env, 'DELETE FROM bb_photos WHERE id = ?1', p.id),
  ]);
}

/**
 * Replace the file behind a photo with a better one (the full-quality original from the camera roll,
 * after a carrier-compressed MMS came in by text). Uploader only. Same id, so tags, reactions, comments
 * and album stay. Multipart like bbuploadphoto: `file`, `thumb`, `photoId`, optional `taken_at`, `width`, `height`.
 */
export async function replacePhoto({ env, me, request, body }) {
  const form = body.form;
  if (!form) throw new ApiError('bad_file', 400);
  const p = await photoRow(env, form.get('photoId'));
  if (p.uploader_id !== me.id) throw new ApiError('not_allowed', 403);
  const file = form.get('file');
  if (!file || typeof file === 'string') throw new ApiError('bad_file', 400);
  if (file.size > MAX_PHOTO_BYTES) throw new ApiError('too_big', 413);
  const contentType = file.type || 'application/octet-stream';
  if (!isImageType(contentType)) throw new ApiError('bad_file', 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) throw new ApiError('bad_file', 400);
  const thumb = form.get('thumb');
  const thumbBytes = thumb && typeof thumb !== 'string' ? new Uint8Array(await thumb.arrayBuffer()) : null;
  const width = Number(form.get('width')) > 0 ? Math.round(Number(form.get('width'))) : p.width;
  const height = Number(form.get('height')) > 0 ? Math.round(Number(form.get('height'))) : p.height;
  const takenMs = form.get('taken_at') ? Date.parse(form.get('taken_at')) : NaN;
  const ex = readExif(bytes, { timeZone: env.PLAN_TIMEZONE || 'UTC' });
  const takenAt = Number.isFinite(takenMs) && takenMs > 0 ? new Date(takenMs).toISOString() : ex.taken_at || p.taken_at;
  const lat = ex.lat ?? p.lat, lng = ex.lng ?? p.lng;
  const filename = String(file.name || p.filename).slice(0, 200);

  const origKey = `orig/${p.id}.${extFromType(contentType, filename)}`;
  const thumbKey = thumbBytes && thumbBytes.length ? `thumb/${p.id}.jpg` : p.thumb_key;
  await env.PHOTOS.put(origKey, bytes, { httpMetadata: { contentType }, customMetadata: { filename, uploader: me.id, replaced: nowIso() } });
  if (thumbBytes && thumbBytes.length) await env.PHOTOS.put(thumbKey, thumbBytes, { httpMetadata: { contentType: 'image/jpeg' } });
  if (p.orig_key !== origKey) await env.PHOTOS.delete(p.orig_key);
  await q(env, `UPDATE bb_photos SET orig_key = ?2, thumb_key = ?3, filename = ?4, content_type = ?5, bytes = ?6, width = ?7, height = ?8, taken_at = ?9, lat = ?10, lng = ?11, source = 'app' WHERE id = ?1`,
    p.id, origKey, thumbKey, filename, contentType, bytes.length, width || ex.width, height || ex.height, takenAt, lat, lng).run();
  return getPhoto(env, me.id, p.id);
}

export async function deletePhoto({ env, me, body }) {
  const p = await photoRow(env, body.photoId || body.id);
  if (!(await canManagePhoto(env, me, p))) throw new ApiError('not_allowed', 403);
  await removePhoto(env, p);
  return { ok: true, id: p.id };
}

export async function untagMe({ env, me, body }) {
  const p = await photoRow(env, body.photoId || body.id);
  await q(env, 'DELETE FROM bb_photo_tags WHERE photo_id = ?1 AND fellow_id = ?2', p.id, me.id).run();
  return getPhoto(env, me.id, p.id);
}

/** `{}` = cohort (everything), `{ eventId }` = one event album, `{ tagged: true }` = photos I'm tagged in. */
export async function downloadAlbum({ env, me, body }) {
  let stmt;
  if (body.tagged) {
    stmt = q(env, `SELECT p.id, p.filename, p.bytes FROM bb_photos p JOIN bb_photo_tags t ON t.photo_id = p.id
                   WHERE t.fellow_id = ?1 AND p.status = 'ok' ORDER BY p.created_at`, me.id);
  } else if (body.eventId) {
    stmt = q(env, `SELECT id, filename, bytes FROM bb_photos WHERE event_id = ?1 AND status = 'ok' ORDER BY created_at`, requireId(body.eventId));
  } else {
    stmt = q(env, `SELECT id, filename, bytes FROM bb_photos WHERE status = 'ok' ORDER BY created_at`);
  }
  return (await rows(stmt)).map((p) => ({ id: p.id, url: `/photos/${p.id}?size=orig`, filename: p.filename, bytes: p.bytes }));
}

/* ───────────────────────────── inbound (pending) ────────────────────────── */

export async function confirmInbound({ env, me, body }) {
  const p = await photoRow(env, body.photoId || body.id);
  if (p.uploader_id !== me.id) throw new ApiError('not_allowed', 403);
  const eid = body.eventId === undefined ? p.event_id : body.eventId ? (await eventRow(env, body.eventId)).id : null;
  await q(env, `UPDATE bb_photos SET status = 'ok', event_id = ?2 WHERE id = ?1`, p.id, eid).run();
  return getPhoto(env, me.id, p.id);
}

/** "Post mine automatically": inbound photos from this fellow skip the review list. */
export async function setInboundAuto({ env, me, body }) {
  const on = body.on ? 1 : 0;
  await q(env, 'UPDATE bb_fellows SET inbound_auto = ?2 WHERE id = ?1', me.id, on).run();
  return { autoPost: !!on };
}

export async function discardInbound({ env, me, body }) {
  const p = await photoRow(env, body.photoId || body.id);
  if (p.uploader_id !== me.id) throw new ApiError('not_allowed', 403);
  if (p.status !== 'pending') throw new ApiError('not_allowed', 403);
  await removePhoto(env, p);
  return { ok: true, id: p.id };
}

/* ───────────────────────────── GET /photos/:id ──────────────────────────── */

/**
 * Streams a photo from R2. `size=thumb` (default) → thumb/<id>.jpg, falling back to the
 * original when no thumb exists (inbound Slack/SMS photos; the client may regenerate one
 * with updatePhoto later). `size=full` → 1600px via the IMAGES binding when configured,
 * else the original. `size=orig` → untouched bytes as an attachment with the original filename.
 * Photo ids are unguessable uuids; this route is not session-gated so <img> tags work.
 */
export async function servePhoto(request, env, idPart, size) {
  const id = idPart.replace(/\.[a-z0-9]+$/i, '').split('/')[0];
  if (!id) return new Response('not found', { status: 404 });
  const p = await q(env, 'SELECT * FROM bb_photos WHERE id = ?1', id).first();
  if (!p) return new Response('not found', { status: 404 });
  size = size || 'thumb';

  const key = size === 'thumb' && p.thumb_key ? p.thumb_key : p.orig_key;
  const obj = await env.PHOTOS.get(key);
  if (!obj) return new Response('not found', { status: 404 });

  const headers = new Headers();
  headers.set('content-type', obj.httpMetadata?.contentType || p.content_type || 'application/octet-stream');
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'private, max-age=86400');
  headers.set('x-bb-size', key === p.orig_key ? 'orig' : 'thumb');

  if (size === 'orig') {
    headers.set('content-disposition', `attachment; filename="${(p.filename || id).replace(/["\r\n]/g, '')}"; filename*=UTF-8''${encodeURIComponent(p.filename || id)}`);
    headers.set('content-length', String(obj.size));
    return new Response(obj.body, { status: 200, headers });
  }
  if (size === 'full' && env.IMAGES && key === p.orig_key) {
    try {
      const out = await env.IMAGES.input(obj.body).transform({ width: 1600, height: 1600, fit: 'scale-down' }).output({ format: 'image/jpeg', quality: 85 });
      const r = out.response();
      const h = new Headers(r.headers);
      h.set('cache-control', 'private, max-age=86400');
      h.set('x-bb-size', 'full');
      return new Response(r.body, { status: 200, headers: h });
    } catch (e) {
      console.warn('IMAGES transform failed, serving original', e);
      const again = await env.PHOTOS.get(key); // body already consumed
      headers.set('content-length', String(again.size));
      return new Response(again.body, { status: 200, headers });
    }
  }
  if (request.headers.get('if-none-match') === obj.httpEtag) return new Response(null, { status: 304, headers });
  headers.set('content-length', String(obj.size));
  return new Response(obj.body, { status: 200, headers });
}

/* exported for inbound.js */
export { eventRow, getPhoto, windowState };
