/*
 * Basecamp Bonding: api implementation that talks straight to the reference Worker (worker/), for the demo
 * served by `wrangler dev` at http://localhost:8787. Same contract as mock-api.js and pulse-adapter/bonding.js.
 * Dev sign-in is the X-Dev-Fellow header (see worker/src/auth.js); Pulse uses its own session instead.
 *
 *   var api = BasecampBondingWorkerApi.create({ base: "", fellowId: "<id from seed.sql>" });
 */
(function (root) {
  "use strict";
  function create(opts) {
    opts = opts || {};
    var base = opts.base || "", fellowId = opts.fellowId;
    var S = root.BasecampBondingShape;
    var cache = { events: [] };
    var uid = function () { return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2); };
    function err(code, status) { var e = new Error(code); e.code = code; e.status = status; return e; }
    function call(ep, body, isForm) {
      var headers = { "x-dev-fellow": fellowId };
      if (!isForm) headers["content-type"] = "application/json";
      return fetch(base + "/api/" + ep, { method: "POST", headers: headers, body: isForm ? body : JSON.stringify(body || {}) })
        .catch(function () { throw err("offline", 0); })
        .then(function (r) { return r.json().catch(function () { return null; }).then(function (d) {
          if (!r.ok) throw err(d && d.error || "http_" + r.status, r.status);
          return d || {};
        }); });
    }
    var ev = function (r) { return S.fromServer.event(r); }, ph = function (r) { return S.fromServer.photo(r); };
    var api = {
      load: function () { return call("bbload").then(function (d) { var out = S.fromServer.load(d); cache.events = d.events || []; return out; }); },
      createEvent: function (f) { return call("bbcreateevent", S.toServer.eventFields(f)).then(ev); },
      updateEvent: function (id, f) { return call("bbupdateevent", { eventId: id, fields: S.toServer.eventFields(f) }).then(ev); },
      cancelEvent: function (id) { return call("bbcancelevent", { eventId: id }).then(ev); },
      rsvp: function (id, status) { return call("bbrsvp", { eventId: id, status: status }).then(ev); },
      invite: function (id, ids) { return call("bbinvite", { eventId: id, fellowIds: ids }).then(ev); },
      attend: function (id) { return call("bbattend", { eventId: id }).then(ev); },
      attendLate: function (id, o) { return call("bbattendlate", { eventId: id, photoId: o && o.photoId || undefined }).then(ev); },
      confirmAttendance: function (id, fid, ok) { return call("bbconfirmattendance", { eventId: id, fellowId: fid, ok: !!ok }).then(ev); },
      vouch: function (id, fid) { return call("bbvouch", { eventId: id, fellowId: fid }).then(ev); },
      checkin: function (code) { return call("bbcheckin", { code: code }).then(ev); },
      newCheckinCode: function (id) { return call("bbnewcheckincode", { eventId: id }).then(function (r) { var e = cache.events.find(function (x) { return x.id === id; }); if (e && r) { e.checkinToken = String(r.code || "").slice(id.length + 1); e.checkinPin = r.pin; } return r; }); },
      checkinCode: function (id) { var e = cache.events.find(function (x) { return x.id === id; }); return e && e.checkinToken && e.checkinPin ? Promise.resolve({ code: id + "-" + e.checkinToken, pin: e.checkinPin }) : api.newCheckinCode(id); },
      react: function (t, emoji, on) { return call("bbreact", { target: t, emoji: emoji, on: !!on }).then(function (r) { return r && r.starts_at ? ev(r) : r && r.uploader_id ? ph(r) : r; }); },
      comment: function (t, text) { var id = uid(); return call("bbcomment", { target: t, text: text, id: id }).then(function (r) { var c = (r.comments || []).find(function (x) { return x.id === id; }); return c ? S.fromServer.comment(c) : { id: id, text: text, created_at: Date.now(), reactions: [] }; }); },
      deleteComment: function (id) { return call("bbdeletecomment", { id: id }); },
      uploadPhoto: function (file, o) {
        o = o || {};
        var fd = new FormData();
        fd.append("file", file, file.name || "photo.jpg");
        var thumb = S.dataUrlToBlob(o.thumb); if (thumb) fd.append("thumb", thumb, "thumb.jpg");
        if (o.eventId) fd.append("eventId", o.eventId);
        if (o.caption) fd.append("caption", o.caption);
        if (o.lat != null && o.lng != null) { fd.append("lat", String(o.lat)); fd.append("lng", String(o.lng)); }
        fd.append("tags", JSON.stringify(o.tags || []));
        if (o.width) fd.append("width", String(o.width)); if (o.height) fd.append("height", String(o.height));
        if (o.taken_at) fd.append("taken_at", new Date(o.taken_at).toISOString());
        return call("bbuploadphoto", fd, true).then(ph);
      },
      replacePhoto: function (id, file, o) {
        o = o || {}; var fd = new FormData(); fd.append("photoId", id); fd.append("file", file, file.name || "photo.jpg");
        var thumb = S.dataUrlToBlob(o.thumb); if (thumb) fd.append("thumb", thumb, "thumb.jpg");
        if (o.width) fd.append("width", String(o.width)); if (o.height) fd.append("height", String(o.height)); if (o.taken_at) fd.append("taken_at", new Date(o.taken_at).toISOString());
        if (o.lat != null && o.lng != null) { fd.append("lat", String(o.lat)); fd.append("lng", String(o.lng)); }
        return call("bbreplacephoto", fd, true).then(ph);
      },
      photoUrl: function (id, o) { return base + "/photos/" + encodeURIComponent(id) + "?size=" + ((o && o.size) || "thumb"); },
      downloadAlbum: function (scope) { return call("bbdownloadalbum", scope || {}).then(function (list) { return list.map(function (f) { return Object.assign({}, f, { url: base + f.url }); }); }); },
      updatePhoto: function (id, f) { return call("bbupdatephoto", { photoId: id, fields: f }).then(ph); },
      untagMe: function (id) { return call("bbuntagme", { photoId: id }).then(ph); },
      deletePhoto: function (id) { return call("bbdeletephoto", { photoId: id }); },
      confirmInbound: function (id, o) { return call("bbconfirminbound", { photoId: id, eventId: o && o.eventId || null }).then(ph); },
      discardInbound: function (id) { return call("bbdiscardinbound", { photoId: id }); },
      setInboundAuto: function (on) { return call("bbsetinboundauto", { on: !!on }); },
      _switchTo: function (id) { fellowId = id; }
    };
    return api;
  }
  root.BasecampBondingWorkerApi = { create: create };
})(typeof window !== "undefined" ? window : this);
