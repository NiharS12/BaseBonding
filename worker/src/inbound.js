// Inbound photos: Slack Events API (POST /hooks/slack) and Twilio MMS (POST /hooks/twilio).
//
// Both verify the provider's signature, resolve the sender to a fellow (bb_inbound_identities,
// then email/phone match against bb_fellows), download the media into R2 (orig/<id>.<ext>,
// no thumb: Workers have no canvas, so thumb_key stays NULL and GET /photos/:id serves the
// original until a client regenerates one), route the caption to an album, and store the
// photo with source slack|sms and status 'pending' (the sender confirms/discards in-app;
// bbload auto-accepts after 24 h).

import { ApiError, json, uuid, nowIso, slugify, normalizePhone, extFromType, hmac, timingSafeEqual, MAX_PHOTO_BYTES } from './util.js';

const SLACK_MAX_AGE = 5 * 60; // seconds
const FUZZY_DAYS = 3;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

/* ────────────────────────────── album routing ───────────────────────────── */

/**
 * Caption → album. `#cohort` → cohort (null). `#<slug>` → event whose slugified title starts
 * with slug, or whose id equals/starts with it. Otherwise fuzzy: best title-word overlap
 * among events within ±3 days of now. Else cohort.
 * Returns { eventId, label, caption } where caption has the routing hashtag removed.
 */
export async function routeCaption(env, text) {
  const caption = String(text || '').trim();
  const events = (await env.DB.prepare(
    `SELECT id, title, starts_at FROM bb_events WHERE cancelled = 0 ORDER BY starts_at DESC LIMIT 500`).all()).results || [];
  const tags = [...caption.matchAll(/(^|\s)#([a-z0-9][a-z0-9_-]*)/gi)].map((m) => m[2].toLowerCase());
  const strip = (tag) => caption.replace(new RegExp(`(^|\\s)#${tag}\\b`, 'i'), '$1').replace(/\s+/g, ' ').trim();

  for (const tag of tags) {
    if (tag === 'cohort') return { eventId: null, label: 'Cohort album', caption: strip(tag) };
    const slug = slugify(tag);
    const hit = events.find((e) => e.id === tag || e.id.startsWith(tag) || slugify(e.title).startsWith(slug) || slugify(e.title).includes('-' + slug));
    if (hit) return { eventId: hit.id, label: hit.title, caption: strip(tag) };
  }

  const now = Date.now();
  const near = events.filter((e) => Math.abs(Date.parse(e.starts_at) - now) <= FUZZY_DAYS * 86400000);
  if (caption && near.length) {
    const words = new Set(slugify(caption).split('-').filter((w) => w.length > 2));
    let best = null, bestScore = 0;
    for (const e of near) {
      const tw = slugify(e.title).split('-').filter((w) => w.length > 2);
      const score = tw.filter((w) => words.has(w)).length;
      if (score > bestScore) { best = e; bestScore = score; }
    }
    if (best) return { eventId: best.id, label: best.title, caption };
  }
  return { eventId: null, label: 'Cohort album', caption };
}

/* ───────────────────────────── identity lookup ──────────────────────────── */

async function identity(env, channel, externalId) {
  const r = await env.DB.prepare(
    `SELECT f.id, f.name, f.email FROM bb_inbound_identities i JOIN bb_fellows f ON f.id = i.fellow_id WHERE i.channel = ?1 AND i.external_id = ?2`)
    .bind(channel, externalId).first();
  return r || null;
}

async function remember(env, channel, externalId, fellowId) {
  await env.DB.prepare(`INSERT OR REPLACE INTO bb_inbound_identities (channel, external_id, fellow_id, created_at) VALUES (?1, ?2, ?3, ?4)`)
    .bind(channel, externalId, fellowId, nowIso()).run();
}

async function fellowByEmail(env, email) {
  if (!email) return null;
  return env.DB.prepare(`SELECT id, name, email FROM bb_fellows WHERE lower(email) = lower(?1)`).bind(String(email).trim()).first();
}

async function fellowByPhone(env, phone) {
  const want = normalizePhone(phone);
  if (!want) return null;
  const all = (await env.DB.prepare(`SELECT id, name, email, phone FROM bb_fellows WHERE phone IS NOT NULL AND phone != ''`).all()).results || [];
  return all.find((f) => normalizePhone(f.phone) === want) || null;
}

/* ───────────────────────────── store a photo ────────────────────────────── */

/** Does this fellow want inbound photos posted without review? */
export async function inboundAuto(env, fellowId) {
  const r = await env.DB.prepare('SELECT inbound_auto FROM bb_fellows WHERE id = ?1').bind(fellowId).first();
  return !!(r && r.inbound_auto);
}
const inboundNote = (auto) => auto ? 'Posted to the album.' : 'Confirm in Pulse › Bonding (auto-accepted after 24h).';

async function storeInbound(env, { fellowId, eventId, caption, bytes, contentType, filename, width, height, source }) {
  const id = uuid();
  const status = (await inboundAuto(env, fellowId)) ? 'ok' : 'pending';
  const origKey = `orig/${id}.${extFromType(contentType, filename)}`;
  await env.PHOTOS.put(origKey, bytes, { httpMetadata: { contentType }, customMetadata: { filename: String(filename).slice(0, 200), uploader: fellowId, source } });
  await env.DB.prepare(
    `INSERT INTO bb_photos (id, event_id, uploader_id, orig_key, thumb_key, filename, content_type, bytes, width, height, caption, source, status, created_at)
     VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?13, ?12)`)
    .bind(id, eventId, fellowId, origKey, String(filename).slice(0, 200), contentType, bytes.length, width || null, height || null, caption || null, source, nowIso(), status)
    .run();
  return id;
}

async function download(url, headers = {}) {
  const r = await fetch(url, { headers, redirect: 'follow' });
  if (!r.ok) throw new Error(`download ${r.status} ${url}`);
  const ct = (r.headers.get('content-type') || '').split(';')[0].trim();
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length > MAX_PHOTO_BYTES) throw new ApiError('too_big', 413);
  return { bytes: buf, contentType: ct };
}

/* ─────────────────────────────────── Slack ──────────────────────────────── */

export async function verifySlack(rawBody, timestamp, signature, secret) {
  if (!secret || !timestamp || !signature) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > SLACK_MAX_AGE) return false;
  const expected = 'v0=' + (await hmac('SHA-256', secret, `v0:${timestamp}:${rawBody}`, 'hex'));
  return timingSafeEqual(expected, signature);
}

async function slackApi(env, method, payload) {
  if (!env.SLACK_BOT_TOKEN) return null;
  const r = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.SLACK_BOT_TOKEN}`, 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!data.ok) console.warn('slack', method, data.error);
  return data.ok ? data : null;
}

async function slackReply(env, event, text) {
  if (!env.SLACK_BOT_TOKEN) return;
  if (event.channel_type === 'im') await slackApi(env, 'chat.postMessage', { channel: event.channel, text });
  else await slackApi(env, 'chat.postEphemeral', { channel: event.channel, user: event.user, text });
}

async function resolveSlackUser(env, event) {
  let fellow = await identity(env, 'slack', event.user);
  if (fellow) return fellow;
  // Try the email Slack has on file (needs users:read.email).
  const info = await slackApi(env, 'users.info', { user: event.user });
  const email = info?.user?.profile?.email;
  fellow = await fellowByEmail(env, email);
  if (fellow) {
    await remember(env, 'slack', event.user, fellow.id);
    return fellow;
  }
  // Last resort: the message itself may be a reply with the Pulse email.
  const m = (event.text || '').match(EMAIL_RE);
  if (m) {
    fellow = await fellowByEmail(env, m[0]);
    if (fellow) {
      await remember(env, 'slack', event.user, fellow.id);
      await slackReply(env, event, `Linked you to ${fellow.name} on Pulse. Send photos any time; add #cohort or #<event> to pick the album.`);
      return fellow;
    }
  }
  return null;
}

export async function handleSlack(request, env) {
  if (!env.SLACK_SIGNING_SECRET) return json({ error: 'not_configured' }, 503);
  const raw = await request.text();
  const ok = await verifySlack(raw, request.headers.get('x-slack-request-timestamp'), request.headers.get('x-slack-signature'), env.SLACK_SIGNING_SECRET);
  if (!ok) return json({ error: 'bad_signature' }, 401);

  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400); }
  if (body.type === 'url_verification') return json({ challenge: body.challenge });
  if (request.headers.get('x-slack-retry-num')) return json({ ok: true, skipped: 'retry' }); // we already handled the first delivery
  if (body.type !== 'event_callback' || body.event?.type !== 'message') return json({ ok: true, skipped: 'not_a_message' });

  const event = body.event;
  if (event.bot_id || !event.user) return json({ ok: true, skipped: 'bot' });
  if (['message_changed', 'message_deleted', 'channel_join'].includes(event.subtype)) return json({ ok: true, skipped: event.subtype });

  const files = (event.files || []).filter((f) => /^image\//i.test(f.mimetype || ''));
  const fellow = await resolveSlackUser(env, event);
  if (!fellow) {
    if (files.length) await slackReply(env, event, "I couldn't match you to a Pulse fellow. Reply with your Pulse email and I'll link you.");
    return json({ ok: true, skipped: 'unknown_user', files: files.length });
  }
  if (!files.length) return json({ ok: true, skipped: 'no_images' });

  const route = await routeCaption(env, event.text);
  const stored = [];
  const errors = [];
  for (const f of files) {
    try {
      if (!f.url_private_download && !f.url_private) throw new Error('no url');
      const { bytes, contentType } = await download(f.url_private_download || f.url_private, env.SLACK_BOT_TOKEN ? { authorization: `Bearer ${env.SLACK_BOT_TOKEN}` } : {});
      const type = /^image\//i.test(contentType) ? contentType : f.mimetype;
      stored.push(await storeInbound(env, {
        fellowId: fellow.id, eventId: route.eventId, caption: route.caption, bytes, contentType: type,
        filename: f.name || f.title || `slack-${f.id}.${extFromType(type)}`, width: f.original_w, height: f.original_h, source: 'slack',
      }));
    } catch (e) {
      console.warn('slack file failed', f.id, e.message || e);
      errors.push(f.id);
    }
  }
  if (stored.length) await slackReply(env, event, `Got ${stored.length} photo${stored.length === 1 ? '' : 's'} → ${route.label}. ${inboundNote(await inboundAuto(env, fellow.id))}`);
  return json({ ok: true, stored: stored.length, photoIds: stored, album: route.label, eventId: route.eventId, failed: errors });
}

/* ─────────────────────────────────── Twilio ─────────────────────────────── */

/** Twilio: base64(HMAC-SHA1(authToken, url + concat(sorted key+value of POST params))). */
export async function verifyTwilio(url, params, signature, authToken) {
  if (!authToken || !signature) return false;
  const keys = Object.keys(params).sort();
  const data = url + keys.map((k) => k + params[k]).join('');
  const expected = await hmac('SHA-1', authToken, data, 'base64');
  return timingSafeEqual(expected, signature);
}

const twiml = (text) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${text ? `<Message>${escapeXml(text)}</Message>` : ''}</Response>`,
    { status: 200, headers: { 'content-type': 'text/xml; charset=utf-8' } });
const escapeXml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

export async function handleTwilio(request, env) {
  if (!env.TWILIO_AUTH_TOKEN) return json({ error: 'not_configured' }, 503);
  const form = await request.formData();
  const params = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string') params[k] = v;

  // Twilio signs the exact URL it was configured with. Behind a proxy that rewrites the
  // host/scheme, reconstruct it from X-Forwarded-* instead of request.url.
  const url = request.url;
  const ok = await verifyTwilio(url, params, request.headers.get('x-twilio-signature'), env.TWILIO_AUTH_TOKEN);
  if (!ok) return json({ error: 'bad_signature' }, 401);

  const from = params.From || '';
  let fellow = await identity(env, 'sms', from);
  if (!fellow) {
    fellow = await fellowByPhone(env, from);
    if (fellow) await remember(env, 'sms', from, fellow.id);
  }
  const body = (params.Body || '').trim();
  if (!fellow) {
    const m = body.match(EMAIL_RE);
    if (m) {
      fellow = await fellowByEmail(env, m[0]);
      if (fellow) {
        await remember(env, 'sms', from, fellow.id);
        return twiml(`Linked you to ${fellow.name} on Pulse. Text photos any time; add #cohort or #<event> to pick the album.`);
      }
      return twiml("That email isn't on the Pulse roster. Reply with the email you use for Pulse.");
    }
    return twiml("I don't recognise this number. Reply with your Pulse email and I'll link it.");
  }

  const n = Math.min(Number(params.NumMedia || 0), 10);
  if (!n) return twiml('Text me a photo (MMS) to add it to an album. Add #cohort or #<event> to choose.');

  const route = await routeCaption(env, body);
  let stored = 0;
  for (let i = 0; i < n; i++) {
    const mediaUrl = params[`MediaUrl${i}`];
    const mediaType = params[`MediaContentType${i}`] || '';
    if (!mediaUrl || !/^image\//i.test(mediaType)) continue;
    try {
      let res = await fetch(mediaUrl, { redirect: 'follow' });
      if (res.status === 401 && params.AccountSid) {
        res = await fetch(mediaUrl, { redirect: 'follow', headers: { authorization: 'Basic ' + btoa(`${params.AccountSid}:${env.TWILIO_AUTH_TOKEN}`) } });
      }
      if (!res.ok) throw new Error(`media ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > MAX_PHOTO_BYTES) throw new Error('too big');
      const ct = (res.headers.get('content-type') || mediaType).split(';')[0].trim();
      await storeInbound(env, {
        fellowId: fellow.id, eventId: route.eventId, caption: route.caption, bytes, contentType: /^image\//i.test(ct) ? ct : mediaType,
        filename: `sms-${(params.MessageSid || uuid()).slice(-8)}-${i + 1}.${extFromType(mediaType)}`, source: 'sms',
      });
      stored++;
    } catch (e) {
      console.warn('twilio media failed', mediaUrl, e.message || e);
    }
  }
  if (!stored) return twiml("Sorry, I couldn't save that photo. Try again?");
  return twiml(`Got ${stored} photo${stored === 1 ? '' : 's'} → ${route.label}. ${inboundNote(await inboundAuto(env, fellow.id))}`);
}
