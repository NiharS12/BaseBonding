// Basecamp Bonding reference worker: router.
//
//   POST /api/bb<name>      JSON in / JSON out, one route per api-contract function (see docs/API.md)
//   GET  /photos/:id        R2 photo bytes (?size=thumb|full|orig)
//   POST /hooks/slack       Slack Events API (inbound photos)
//   POST /hooks/twilio      Twilio MMS webhook (inbound photos)
//   *                       static assets from ../public (env.ASSETS)
//
// Errors are `{ error: "<code>" }` with a 4xx/5xx status, which is what Pulse's client
// turns into ApiError(code, status).

import { resolveFellow } from './auth.js';
import * as bonding from './bonding.js';
import { handleEmail, handleSlack, handleTwilio } from './inbound.js';
import { ApiError, json } from './util.js';

// Route name → handler. Names are `bb` + api function name, lowercased.
const API = {
  bbload: bonding.load,
  bbcreateevent: bonding.createEvent,
  bbupdateevent: bonding.updateEvent,
  bbcancelevent: bonding.cancelEvent,
  bbrsvp: bonding.rsvp,
  bbinvite: bonding.invite,
  bbattend: bonding.attend,
  bbattendlate: bonding.attendLate,
  bbconfirmattendance: bonding.confirmAttendance,
  bbvouch: bonding.vouch,
  bbcheckin: bonding.checkin,
  bbnewcheckincode: bonding.newCheckinCode,
  bbreact: bonding.react,
  bbcomment: bonding.comment,
  bbdeletecomment: bonding.deleteComment,
  bbuploadphoto: bonding.uploadPhoto,
  bbupdatephoto: bonding.updatePhoto,
  bbdeletephoto: bonding.deletePhoto,
  bbuntagme: bonding.untagMe,
  bbdownloadalbum: bonding.downloadAlbum,
  bbconfirminbound: bonding.confirmInbound,
  bbdiscardinbound: bonding.discardInbound,
  bbsetinboundauto: bonding.setInboundAuto,
  bbreplacephoto: bonding.replacePhoto,
};

// "Plans Bot" as a contact card: fellows save it once, then text or email it photos (→ albums) or plans in plain English (→ calendar).
function contactCard(env) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', 'N:Bot;Plans;;;', 'FN:Plans Bot', 'NICKNAME:Flicks Bot', 'ORG:Basecamp Pulse'];
  if (env.INBOUND_SMS_NUMBER) lines.push('TEL;TYPE=CELL:' + env.INBOUND_SMS_NUMBER);
  if (env.INBOUND_EMAIL) lines.push('EMAIL;TYPE=INTERNET:' + env.INBOUND_EMAIL);
  lines.push('NOTE:Text or email photos here (add #event-name to file them under an event), or a plan in plain English like "Tacos at La Taqueria Friday 7pm" to put it on the Bonding calendar.', 'END:VCARD');
  return new Response(lines.join('\r\n') + '\r\n', { headers: { 'content-type': 'text/vcard; charset=utf-8', 'content-disposition': 'inline; filename="plans-bot.vcf"', 'cache-control': 'public, max-age=86400' } });
}

export default {
  // Cloudflare Email Routing → this Worker (free). Route photos@<your domain> here in the dashboard.
  async email(message, env, ctx) { return handleEmail(message, env, ctx); },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith('/api/')) return await handleApi(request, env, ctx, path.slice(5).toLowerCase());
      if (path.startsWith('/photos/')) return await bonding.servePhoto(request, env, path.slice(8), url.searchParams.get('size'));
      if (path === '/hooks/slack') return request.method === 'POST' ? await handleSlack(request, env, ctx) : json({ error: 'method' }, 405);
      if (path === '/hooks/twilio') return request.method === 'POST' ? await handleTwilio(request, env, ctx) : json({ error: 'method' }, 405);
      if (path === '/bonding/contact.vcf') return contactCard(env);
      return env.ASSETS ? env.ASSETS.fetch(request) : json({ error: 'not_found' }, 404);
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.code }, e.status);
      console.error('bonding: unhandled', e && e.stack ? e.stack : e);
      return json({ error: 'server_error' }, 500);
    }
  },
};

async function handleApi(request, env, ctx, name) {
  const fn = API[name];
  if (!fn) return json({ error: 'not_found' }, 404);
  if (request.method !== 'POST') return json({ error: 'method' }, 405);

  const me = await resolveFellow(request, env);
  const ct = (request.headers.get('content-type') || '').toLowerCase();
  let body = {};
  if (ct.startsWith('multipart/form-data')) {
    body = { form: await request.formData() };
  } else if (ct.includes('json') || ct === '') {
    const text = await request.text();
    if (text) {
      try { body = JSON.parse(text); } catch { throw new ApiError('bad_json', 400); }
    }
  } else {
    throw new ApiError('bad_content_type', 415);
  }
  const result = await fn({ env, me, request, ctx, body: body || {} });
  return json(result == null ? { ok: true } : result);
}
