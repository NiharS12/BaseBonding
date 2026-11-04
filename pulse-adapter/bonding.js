/* Basecamp Pulse · bonding.js
   The Bonding tab: Basecamp Bonding, built by fellow Nihar Shankar (his app is in public/bonding/). Team bonding events on a
   shared calendar, "I was there" attendance, and cohort / event photo albums. Loads it the first time the tab opens, talks to
   Pulse's API for it, and handles a scanned check-in code (/#bb-checkin-<code>) once the fellow is signed in.

   Drop this file into Pulse's public/js/ and add `import './bonding.js';` to main.js next to `import './connect.js';`.
   Same shape as connect.js: the module gets an `api` object whose functions return Promises; every call goes through
   API.call('bb…'), so Pulse's retry/backoff and sign-out handling apply. The endpoints are the ones in docs/API.md
   (worker/src/index.js has the route table): merge worker/src/bonding.js + inbound.js into Pulse's Worker and swap
   worker/src/auth.js's resolveFellow() for Pulse's session lookup. */
import { API } from './core.js';
import { db, hooks, startHash } from './state.js';

const MSG = {
  window_closed: 'The check-in window for this event has closed. Use "I was there too" instead.',
  not_host: 'Only the host can do that.',
  already: "You're already on the list.",
  bad_code: "That check-in code didn't work. Ask the host to show it again.",
  gone: "That isn't here anymore.",
  too_big: 'That photo is over 25 MB. Try another one.',
  bad_photo: "That file isn't a photo we can read.",
  bad_text: 'Add a title and a start time.',
  not_allowed: "You can't do that one.",
  offline: "You're offline. Try again once you're connected.",
  unreachable: "Couldn't reach Pulse. Check the Wi-Fi and try again.",
  slow_down: 'A lot of taps at once. Try again in a moment.',
  signed_out: 'Sign in to Pulse again, then try once more.',
};
const why = e => { const err = new Error(MSG[e?.code] || 'Something went wrong. Try again.'); err.code = e?.code; throw err; };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

// Multipart upload: API.call() is JSON-only, so this one request goes straight to fetch with Pulse's bearer token.
async function upload(fd, ep = '/api/bbuploadphoto') {
  const auth = window.PulseAPI?.auth?.();
  let res;
  try { res = await fetch(ep, { method: 'POST', headers: auth ? { authorization: 'Bearer ' + auth.token } : {}, body: fd }); }
  catch { why({ code: 'offline' }); }
  const data = await res.json().catch(() => null);
  if (!res.ok) why({ code: data?.error || 'unreachable' });
  return data;
}

let bb = null, loading = null, cache = { events: [] }, shape = null;
const S = () => shape || (shape = window.BasecampBondingShape);
const api = {
  load: () => API.call('bbload', {}).then(d => { cache.events = d.events || []; return S().fromServer.load(d); }, why),
  createEvent: f => API.call('bbcreateevent', S().toServer.eventFields(f)).then(S().fromServer.event, why),
  updateEvent: (id, f) => API.call('bbupdateevent', { eventId: id, fields: S().toServer.eventFields(f) }).then(S().fromServer.event, why),
  cancelEvent: id => API.call('bbcancelevent', { eventId: id }).then(S().fromServer.event, why),
  rsvp: (id, status) => API.call('bbrsvp', { eventId: id, status }).then(S().fromServer.event, why),
  invite: (id, fellowIds) => API.call('bbinvite', { eventId: id, fellowIds }).then(S().fromServer.event, why),
  attend: id => API.call('bbattend', { eventId: id }).then(S().fromServer.event, why),
  attendLate: (id, o) => API.call('bbattendlate', { eventId: id, photoId: o?.photoId || undefined }).then(S().fromServer.event, why),
  confirmAttendance: (id, fellowId, ok) => API.call('bbconfirmattendance', { eventId: id, fellowId, ok: !!ok }).then(S().fromServer.event, why),
  vouch: (id, fellowId) => API.call('bbvouch', { eventId: id, fellowId }).then(S().fromServer.event, why),
  checkin: code => API.call('bbcheckin', { code }).then(S().fromServer.event, why),
  newCheckinCode: id => API.call('bbnewcheckincode', { eventId: id }).catch(why),
  checkinCode: id => { const e = cache.events.find(x => x.id === id); return e?.checkinToken && e?.checkinPin ? Promise.resolve({ code: id + '-' + e.checkinToken, pin: e.checkinPin }) : api.newCheckinCode(id); },
  react: (target, emoji, on) => API.call('bbreact', { target, emoji, on: !!on }).then(r => r?.starts_at ? S().fromServer.event(r) : r?.uploader_id ? S().fromServer.photo(r) : r, why),
  comment: (target, text) => { const id = uid(); return API.call('bbcomment', { target, text, id }).then(r => { const c = (r.comments || []).find(x => x.id === id); return c ? S().fromServer.comment(c) : { id, text, created_at: Date.now(), reactions: [] }; }, why); },
  deleteComment: id => API.call('bbdeletecomment', { id }).catch(why),
  uploadPhoto: (file, o = {}) => {
    const fd = new FormData();
    fd.append('file', file, file.name || 'photo.jpg');
    const thumb = S().dataUrlToBlob(o.thumb); if (thumb) fd.append('thumb', thumb, 'thumb.jpg');
    if (o.eventId) fd.append('eventId', o.eventId);
    if (o.caption) fd.append('caption', o.caption);
    fd.append('tags', JSON.stringify(o.tags || []));
    if (o.width) fd.append('width', String(o.width));
    if (o.height) fd.append('height', String(o.height));
    if (o.taken_at) fd.append('taken_at', new Date(o.taken_at).toISOString());
    return upload(fd).then(S().fromServer.photo);
  },
  replacePhoto: (id, file, o = {}) => {
    const fd = new FormData(); fd.append('photoId', id); fd.append('file', file, file.name || 'photo.jpg');
    const thumb = S().dataUrlToBlob(o.thumb); if (thumb) fd.append('thumb', thumb, 'thumb.jpg');
    if (o.width) fd.append('width', String(o.width)); if (o.height) fd.append('height', String(o.height)); if (o.taken_at) fd.append('taken_at', new Date(o.taken_at).toISOString());
    return upload(fd, '/api/bbreplacephoto').then(S().fromServer.photo);
  },
  photoUrl: (id, o) => '/photos/' + encodeURIComponent(id) + '?size=' + (o?.size || 'thumb'),
  downloadAlbum: scope => API.call('bbdownloadalbum', scope || {}).catch(why),
  updatePhoto: (id, fields) => API.call('bbupdatephoto', { photoId: id, fields }).then(S().fromServer.photo, why),
  untagMe: id => API.call('bbuntagme', { photoId: id }).then(S().fromServer.photo, why),
  deletePhoto: id => API.call('bbdeletephoto', { photoId: id }).catch(why),
  confirmInbound: (id, o) => API.call('bbconfirminbound', { photoId: id, eventId: o?.eventId || null }).then(S().fromServer.photo, why),
  discardInbound: id => API.call('bbdiscardinbound', { photoId: id }).catch(why),
  setInboundAuto: on => API.call('bbsetinboundauto', { on: !!on }).catch(why),
};

// A check-in code always points at the main address, like Connect's badges do.
const MAIN = 'basecamppulse.com', SAME_APP = [MAIN, 'www.' + MAIN, 'basecamp-pulse.salif-4f3.workers.dev'];
const QR_BASE = SAME_APP.includes(location.hostname) ? `https://${MAIN}/` : location.origin + '/';

// A code scanned before Pulse was open (or before sign-in): kept until the tab is ready for it.
let pending = /^#bb-checkin-(.+)$/.exec(startHash)?.[1] || null;
const script = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); });
function load() {
  if (!loading) {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/bonding/basecampbonding.css'; document.head.append(css);
    // qr.js is shared with Connect; loading it twice is harmless.
    loading = Promise.all([window.PulseQR ? null : script('/connect/qr.js'), script('/bonding/shape.js')])
      .then(() => script('/bonding/basecampbonding.js'))
      .then(() => { bb = window.BasecampBonding.mount(document.getElementById('basecampbonding'), { api, qrBase: QR_BASE }); }, () => { loading = null; });
  }
  return loading;
}
function open() {
  if (!db) return;
  load().then(() => { if (bb && pending) { const code = pending; pending = null; bb.openCheckinLink(code); } });
}
// Every time the tab opens, the calendar is read fresh (the module also polls while the tab is visible).
hooks.bonding = on => { if (on) { if (bb) bb.reload(); open(); } };
// Pulse's hash router: add `bb-checkin-` alongside `connect-` in shell.js so a scanned code lands here.
hooks.bbscanned = code => { pending = code; hooks.openBondingTab?.(); };
