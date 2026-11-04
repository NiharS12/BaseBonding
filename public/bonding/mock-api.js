/*
 * Basecamp Bonding: mock api for the standalone demo. No server. Everything lives in localStorage and
 * every open tab hears about changes through a BroadcastChannel, so two tabs behave like two phones.
 * Implements the same api contract as pulse-adapter/bonding.js (see docs/API.md).
 *
 *   var api = BasecampBondingMock.create({ me: '<fellowId>' });   // pick who "you" are
 *   BasecampBonding.mount(el, { api });
 */
(function (root) {
  "use strict";
  var KEY = "bb.mock.v1", CH = "bb.mock";
  var uid = function () { return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)); };
  var now = function () { return Date.now(); };
  var H = 3600e3, D = 24 * H;

  // Demo roster: folk-tale pseudonyms, plus Nihar. Pulse supplies the real roster in production.
  var FELLOWS = [
    ["f1", "Nihar Shankar", "Tulane · New Orleans, LA"],
    ["f2", "Johnny Appleseed", "Orchard Collective · Leominster, MA"],
    ["f3", "Annie Oakley", "Fair Shot Foundation · Greenville, OH"],
    ["f4", "Paul Bunyan", "Northwoods Trail Alliance · Bangor, ME"],
    ["f5", "Casey Jones", "Rail Towns Network · Jackson, TN"],
    ["f6", "Calamity Jane", "Deadwood Community Fund · Deadwood, SD"],
    ["f7", "John Henry", "Big Bend Tunnel Project · Talcott, WV"],
    ["f8", "Pecos Bill", "Rio Grande Youth Rodeo · Pecos, TX"]
  ].map(function (f) { return { id: f[0], name: f[1], sub: f[2], photo_url: null }; });

  // Two sample fellows get a painted "profile photo", like a card photo from the Connect tab; the rest show initials.
  function portrait(seed) {
    var c = document.createElement("canvas"); c.width = c.height = 160; var g = c.getContext("2d");
    g.fillStyle = "hsl(" + (seed * 70) + " 40% 70%)"; g.fillRect(0, 0, 160, 160);
    g.fillStyle = "hsl(" + (seed * 70 + 30) + " 30% 40%)"; g.beginPath(); g.arc(80, 64, 30, 0, 7); g.fill();
    g.beginPath(); g.ellipse(80, 150, 54, 48, 0, Math.PI, 0); g.fill();
    return c.toDataURL("image/jpeg", 0.85);
  }

  // A small painted "photo" so albums have something to show without any files. Returns a JPEG data URL.
  function paint(w, h, seed, label) {
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    var g = c.getContext("2d");
    var hues = [28, 200, 140, 300, 45, 210, 350, 170];
    var hue = hues[seed % hues.length];
    g.fillStyle = "hsl(" + hue + " 45% 72%)"; g.fillRect(0, 0, w, h);
    g.fillStyle = "hsl(" + ((hue + 40) % 360) + " 50% 60%)";
    g.beginPath(); g.moveTo(0, h); g.lineTo(w * 0.3, h * (0.35 + (seed % 3) * 0.1)); g.lineTo(w * 0.6, h * 0.7); g.lineTo(w * 0.8, h * 0.5); g.lineTo(w, h); g.closePath(); g.fill();
    g.fillStyle = "hsl(" + hue + " 35% 92%)"; g.beginPath(); g.arc(w * (0.2 + (seed % 5) * 0.12), h * 0.25, w * 0.08, 0, 7); g.fill();
    if (label) { g.fillStyle = "rgba(0,0,0,.35)"; g.font = Math.round(w * 0.06) + "px Poppins, sans-serif"; g.fillText(label, w * 0.05, h * 0.92); }
    return c.toDataURL("image/jpeg", 0.85);
  }

  var pin = function () { return String(Math.floor(Math.random() * 1000000)).padStart(6, "0"); };
  function seedState() {
    var t = now();
    FELLOWS[1].photo_url = portrait(1); FELLOWS[3].photo_url = portrait(3);
    var start = new Date(); start.setMinutes(0, 0, 0);
    var tonight = start.getTime() + (start.getHours() < 20 ? (20 - start.getHours()) * H : 10 * 60e3);
    var ev = function (o) {
      return Object.assign({ id: uid(), description: "", location_url: "", cancelled: false, created_at: t - D, updated_at: t - D,
        invites: [], rsvps: [], attendance: [], vouches: [], reactions: [], comments: [], checkin_token: Math.random().toString(36).slice(2, 10), checkin_pin: pin() }, o);
    };
    var events = [
      ev({ title: "Karaoke at Pandora", starts_at: tonight, ends_at: tonight + 2.5 * H, location: "Pandora Karaoke, 50 Mason St", location_url: "https://maps.apple.com/?q=Pandora+Karaoke+SF", host_id: "f1",
        description: "Private room booked for 15. Bring your worst song. We'll split the room fee.",
        rsvps: [["f1", "going"], ["f2", "going"], ["f3", "going"], ["f4", "going"], ["f5", "maybe"], ["f6", "going"], ["f7", "maybe"]].map(function (r) { return { fellow_id: r[0], status: r[1] }; }),
        invites: ["f2", "f3", "f4", "f5"],
        reactions: [["🔥", "f2"], ["🔥", "f3"], ["🔥", "f4"], ["❤️", "f5"], ["😂", "f6"]].map(function (r) { return { emoji: r[0], fellow_id: r[1] }; }),
        comments: [{ id: uid(), fellow_id: "f6", text: "Booked the room, confirmation is under my name", created_at: t - 3 * H, reactions: [{ emoji: "❤️", fellow_id: "f1" }] },
          { id: uid(), fellow_id: "f5", text: "Running 10 late, save me a mic", created_at: t - 20 * 60e3, reactions: [] }] }),
      ev({ title: "Tacos in the Mission", starts_at: tonight + 2 * D - H, ends_at: tonight + 2 * D + H, location: "La Taqueria, Mission", host_id: "f3",
        description: "Cash only. We'll grab the long table in the back.",
        rsvps: [["f3", "going"], ["f6", "going"], ["f5", "maybe"], ["f8", "maybe"]].map(function (r) { return { fellow_id: r[0], status: r[1] }; }),
        reactions: [{ emoji: "🔥", fellow_id: "f6" }, { emoji: "❤️", fellow_id: "f8" }], comments: [] }),
      ev({ title: "Sunrise hike, Lands End", starts_at: tonight + 4 * D - 13 * H, ends_at: tonight + 4 * D - 10 * H, location: "Lands End trailhead", host_id: "f2",
        description: "Meet at the Sutro Baths lot. Coffee after at the Beach Chalet.", rsvps: [{ fellow_id: "f2", status: "going" }], comments: [], reactions: [] }),
      ev({ title: "Dolores Park picnic", starts_at: t - 3 * D - 4 * H, ends_at: t - 3 * D - H, location: "Dolores Park, upper lawn", host_id: "f3",
        rsvps: [["f1", "going"], ["f2", "going"], ["f3", "going"], ["f4", "going"], ["f7", "going"]].map(function (r) { return { fellow_id: r[0], status: r[1] }; }),
        attendance: [["f3", "host"], ["f2", "qr"], ["f4", "tap"], ["f7", "tap"]].map(function (a) { return { fellow_id: a[0], status: "confirmed", via: a[1], late: false, created_at: t - 3 * D - 2 * H }; }),
        reactions: [{ emoji: "❤️", fellow_id: "f1" }, { emoji: "❤️", fellow_id: "f2" }, { emoji: "🙌", fellow_id: "f4" }],
        comments: [{ id: uid(), fellow_id: "f4", text: "Best weather we've had all month", created_at: t - 3 * D, reactions: [] }] }),
      ev({ title: "Bowling night", starts_at: t - 6 * D - 3 * H, ends_at: t - 6 * D, location: "Mission Bowling Club", host_id: "f6",
        rsvps: [["f1", "going"], ["f5", "going"], ["f6", "going"], ["f8", "going"]].map(function (r) { return { fellow_id: r[0], status: r[1] }; }),
        attendance: [["f6", "host"], ["f1", "tap"], ["f5", "tap"]].map(function (a) { return { fellow_id: a[0], status: "confirmed", via: a[1], late: false, created_at: t - 6 * D - H }; }),
        reactions: [], comments: [] })
    ];
    var picnic = events[3].id, bowling = events[4].id;
    var photos = [];
    var ph = function (i, eventId, uploader, tags, source, created) {
      var data = paint(1200, 900, i, "");
      photos.push({ id: uid(), event_id: eventId, uploader_id: uploader, filename: "IMG_" + (4000 + i) + ".jpg", content_type: "image/jpeg",
        bytes: Math.round(data.length * 0.75), width: 1200, height: 900, caption: "", taken_at: created - 20 * 60e3, source: source || "app", status: "ok",
        created_at: created, tags: tags, reactions: [], comments: [], _data: data });
    };
    ph(1, picnic, "f3", ["f1", "f2", "f3"], "app", t - 3 * D - 2 * H);
    ph(2, picnic, "f2", ["f4"], "app", t - 3 * D - 1.5 * H);
    ph(3, picnic, "f4", ["f1", "f4", "f7"], "slack", t - 3 * D - H);
    ph(4, picnic, "f7", [], "app", t - 3 * D - 0.5 * H);
    ph(5, bowling, "f6", ["f1", "f5", "f6", "f8"], "app", t - 6 * D - H);
    ph(6, bowling, "f1", ["f5"], "sms", t - 6 * D - 0.5 * H);
    ph(7, null, "f8", ["f8", "f2"], "app", t - 8 * D);
    ph(8, null, "f5", [], "app", t - 9 * D);
    ph(9, null, "f2", ["f1"], "app", t - 10 * D);
    photos[0].reactions = [{ emoji: "❤️", fellow_id: "f2" }, { emoji: "🔥", fellow_id: "f4" }];
    photos[0].comments = [{ id: uid(), fellow_id: "f2", text: "Frame this one", created_at: t - 3 * D, reactions: [] }];
    return { fellows: FELLOWS, events: events, photos: photos, inbound: { slackChannel: "#cohort-photos", smsNumber: "+14155550199", email: "photos@basecamppulse.com", contactUrl: null }, autoPost: {} };
  }

  function create(opts) {
    opts = opts || {};
    var meId = opts.me || "f1";
    var state = null;
    try { state = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
    if (!state || state.v !== 5) { state = seedState(); state.v = 5; save(); }
    var bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CH) : null;
    var listeners = [];
    if (bc) bc.onmessage = function () { try { state = JSON.parse(localStorage.getItem(KEY)); } catch (e) {} listeners.forEach(function (f) { f(); }); };
    function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* quota: photos are big; the demo keeps going in memory */ } if (bc) bc.postMessage("changed"); setTimeout(function () { listeners.forEach(function (f) { f(); }); }, 0); }
    function err(code) { var e = new Error(code); e.code = code; return e; }
    function me() { return state.fellows.find(function (f) { return f.id === meId; }); }
    function event(id) { var e = state.events.find(function (x) { return x.id === id; }); if (!e) throw err("gone"); return e; }
    function photo(id) { var p = state.photos.find(function (x) { return x.id === id; }); if (!p) throw err("gone"); return p; }
    function pub(p) { var o = Object.assign({}, p); delete o._data; return o; }
    function withCounts(e) { var o = Object.assign({}, e); o.photoCount = state.photos.filter(function (p) { return p.event_id === e.id && p.status === "ok"; }).length; return o; }
    function target(t) { if (t.type === "event") return event(t.id); if (t.type === "photo") return photo(t.id); if (t.type === "comment") { for (var i = 0; i < state.events.length; i++) { var c = state.events[i].comments.find(function (x) { return x.id === t.id; }); if (c) return c; } for (i = 0; i < state.photos.length; i++) { c = state.photos[i].comments.find(function (x) { return x.id === t.id; }); if (c) return c; } } throw err("gone"); }
    var latency = function (v) { return new Promise(function (ok) { setTimeout(function () { ok(v); }, 120 + Math.random() * 200); }); };
    var touch = function (e) { e.updated_at = now(); };
    function windowOpen(e) { var t = now(); return t >= e.starts_at - 30 * 60e3 && t <= e.ends_at + 48 * H; }
    function att(e, fid) { return e.attendance.find(function (a) { return a.fellow_id === fid; }); }
    function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

    var api = {
      load: function () { return latency({ me: me(), fellows: state.fellows, events: state.events.map(withCounts), photos: state.photos.map(pub), inbound: Object.assign({}, state.inbound, { autoPost: !!(state.autoPost || {})[meId] }), serverTime: now() }); },
      setInboundAuto: function (on) { state.autoPost = state.autoPost || {}; state.autoPost[meId] = !!on; save(); return latency({ autoPost: !!on }); },
      onChange: function (fn) { listeners.push(fn); },
      createEvent: function (f) {
        if (!f.title || !f.starts_at) throw err("bad_text");
        var e = { id: uid(), title: f.title, description: f.description || "", starts_at: +f.starts_at, ends_at: +(f.ends_at || f.starts_at + 2 * H), location: f.location || "", location_url: f.location_url || "",
          host_id: meId, cancelled: false, created_at: now(), updated_at: now(), invites: f.invites || [], rsvps: [{ fellow_id: meId, status: "going" }], attendance: [], vouches: [], reactions: [], comments: [], checkin_token: Math.random().toString(36).slice(2, 10), checkin_pin: pin() };
        state.events.unshift(e); save(); return latency(withCounts(e));
      },
      updateEvent: function (id, f) { var e = event(id); if (e.host_id !== meId) throw err("not_host"); ["title", "description", "location", "location_url"].forEach(function (k) { if (k in f) e[k] = f[k]; }); if (f.starts_at) e.starts_at = +f.starts_at; if (f.ends_at) e.ends_at = +f.ends_at; if (f.invites) e.invites = f.invites; touch(e); save(); return latency(withCounts(e)); },
      cancelEvent: function (id) { var e = event(id); if (e.host_id !== meId) throw err("not_host"); e.cancelled = true; touch(e); save(); return latency(withCounts(e)); },
      rsvp: function (id, status) { var e = event(id); e.rsvps = e.rsvps.filter(function (r) { return r.fellow_id !== meId; }); if (status && status !== "none") e.rsvps.push({ fellow_id: meId, status: status }); touch(e); save(); return latency(withCounts(e)); },
      invite: function (id, ids) { var e = event(id); ids.forEach(function (x) { if (e.invites.indexOf(x) < 0) e.invites.push(x); }); touch(e); save(); return latency(withCounts(e)); },
      attend: function (id) { var e = event(id); if (!windowOpen(e)) throw err("window_closed"); var a = att(e, meId); if (a) throw err("already"); e.attendance.push({ fellow_id: meId, status: e.host_id === meId ? "confirmed" : "claimed", via: e.host_id === meId ? "host" : "tap", late: false, created_at: now() }); touch(e); save(); return latency(withCounts(e)); },
      attendLate: function (id, o) {
        var e = event(id); o = o || {}; if (att(e, meId)) throw err("already");
        var tagged = state.photos.some(function (p) { return p.event_id === id && p.tags.indexOf(meId) >= 0 && (!o.photoId || p.id === o.photoId); });
        e.attendance.push({ fellow_id: meId, status: tagged ? "confirmed" : "pending", via: tagged ? "photo" : "tap", late: true, created_at: now(), confirmed_at: tagged ? now() : null });
        touch(e); save(); return latency(withCounts(e));
      },
      confirmAttendance: function (id, fid, ok) { var e = event(id); if (e.host_id !== meId) throw err("not_host"); var a = att(e, fid); if (!a) throw err("gone"); if (ok) { a.status = "confirmed"; a.via = "host"; a.confirmed_at = now(); } else { a.status = "denied"; } touch(e); save(); return latency(withCounts(e)); },
      vouch: function (id, fid) {
        var e = event(id); var mine = att(e, meId); if (!mine || mine.status !== "confirmed") throw err("not_allowed");
        var a = att(e, fid); if (!a || a.status !== "pending") throw err("gone");
        if (!e.vouches.some(function (v) { return v.fellow_id === fid && v.voucher_id === meId; })) e.vouches.push({ fellow_id: fid, voucher_id: meId });
        if (e.vouches.filter(function (v) { return v.fellow_id === fid; }).length >= 2) { a.status = "confirmed"; a.via = "vouch"; a.confirmed_at = now(); }
        touch(e); save(); return latency(withCounts(e));
      },
      checkin: function (code) {
        var m = /^(.+)-([^-]+)$/.exec(code || ""); var e = m && state.events.find(function (x) { return x.id === m[1] && (x.checkin_token === m[2] || x.checkin_pin === m[2]); });
        if (!e) throw err("bad_code");
        var via = m[2] === e.checkin_pin ? "code" : "qr";
        var a = att(e, meId); if (a) { a.status = "confirmed"; a.via = via; a.confirmed_at = now(); } else e.attendance.push({ fellow_id: meId, status: "confirmed", via: via, late: !windowOpen(e), created_at: now(), confirmed_at: now() });
        touch(e); save(); return latency(withCounts(e));
      },
      newCheckinCode: function (id) { var e = event(id); if (e.host_id !== meId) throw err("not_host"); e.checkin_token = Math.random().toString(36).slice(2, 10); e.checkin_pin = pin(); save(); return latency({ code: e.id + "-" + e.checkin_token, pin: e.checkin_pin }); },
      checkinCode: function (id) { var e = event(id); if (e.host_id !== meId) throw err("not_host"); return latency({ code: e.id + "-" + e.checkin_token, pin: e.checkin_pin }); },
      react: function (t, emoji, on) { var x = target(t); x.reactions = (x.reactions || []).filter(function (r) { return !(r.fellow_id === meId && r.emoji === emoji); }); if (on) x.reactions.push({ emoji: emoji, fellow_id: meId }); save(); return latency(t.type === "photo" ? pub(x) : x); },
      comment: function (t, text) { text = String(text || "").trim(); if (!text) throw err("bad_text"); var x = target(t); var c = { id: uid(), fellow_id: meId, text: text, created_at: now(), reactions: [] }; x.comments.push(c); save(); return latency(c); },
      deleteComment: function (id) { var c = target({ type: "comment", id: id }); if (c.fellow_id !== meId) throw err("not_allowed"); c.deleted = true; c.text = ""; save(); return latency({ ok: true }); },
      uploadPhoto: function (file, o) {
        o = o || {};
        return new Promise(function (ok, no) {
          if (file.size > 25 * 1024 * 1024) return no(err("too_big"));
          var r = new FileReader();
          r.onload = function () {
            var p = { id: uid(), event_id: o.eventId || null, uploader_id: meId, filename: file.name || "photo.jpg", content_type: file.type || "image/jpeg", bytes: file.size, width: o.width || 0, height: o.height || 0,
              caption: o.caption || "", taken_at: o.taken_at || null, source: "app", status: "ok", created_at: now(), tags: o.tags || [], reactions: [], comments: [], _data: String(r.result), _thumb: o.thumb || null };
            state.photos.unshift(p); save(); setTimeout(function () { ok(pub(p)); }, 300);
          };
          r.onerror = function () { no(err("bad_photo")); };
          r.readAsDataURL(file);
        });
      },
      replacePhoto: function (id, file, o) {
        o = o || {}; var p = photo(id); if (p.uploader_id !== meId) throw err("not_allowed");
        return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { p._data = String(r.result); p._thumb = o.thumb || null; p.filename = file.name || p.filename; p.bytes = file.size; p.width = o.width || p.width; p.height = o.height || p.height; p.taken_at = o.taken_at || p.taken_at; p.source = "app"; save(); setTimeout(function () { ok(pub(p)); }, 300); }; r.onerror = function () { no(err("bad_photo")); }; r.readAsDataURL(file); });
      },
      photoUrl: function (id, o) { var p = photo(id); var size = (o && o.size) || "thumb"; if (size === "thumb" && p._thumb) return p._thumb; return p._data; },
      downloadAlbum: function (o) {
        o = o || {}; var list = state.photos.filter(function (p) { return p.status === "ok" && (o.eventId ? p.event_id === o.eventId : o.tagged ? p.tags.indexOf(meId) >= 0 : true); });
        return latency(list.map(function (p) { return { id: p.id, url: p._data, filename: p.filename, created_at: p.created_at }; }));
      },
      updatePhoto: function (id, f) { var p = photo(id); if ("caption" in f) p.caption = f.caption; if (f.tags) p.tags = f.tags; if ("eventId" in f) p.event_id = f.eventId || null; save(); return latency(pub(p)); },
      untagMe: function (id) { var p = photo(id); p.tags = p.tags.filter(function (x) { return x !== meId; }); save(); return latency(pub(p)); },
      deletePhoto: function (id) { var p = photo(id); var e = p.event_id && state.events.find(function (x) { return x.id === p.event_id; }); if (p.uploader_id !== meId && !(e && e.host_id === meId)) throw err("not_allowed"); state.photos = state.photos.filter(function (x) { return x.id !== id; }); save(); return latency({ ok: true }); },
      confirmInbound: function (id, o) { var p = photo(id); p.status = "ok"; if (o && "eventId" in o) p.event_id = o.eventId || null; save(); return latency(pub(p)); },
      discardInbound: function (id) { return api.deletePhoto(id); },
      // Demo helpers (not part of the contract)
      _switchTo: function (id) { meId = id; },
      _simulateInbound: function (source, caption) {
        var m = /#([a-z0-9-]+)/i.exec(caption || ""); var ev = null;
        if (m && m[1] !== "cohort") ev = state.events.find(function (e) { return slug(e.title).indexOf(m[1].toLowerCase()) === 0; });
        var p = { id: uid(), event_id: ev ? ev.id : null, uploader_id: meId, filename: source + "-" + Date.now() + ".jpg", content_type: "image/jpeg", bytes: 0, width: 1200, height: 900, caption: (caption || "").replace(/#\S+/g, "").trim(), source: source, status: (state.autoPost || {})[meId] ? "ok" : "pending", created_at: now(), tags: [], reactions: [], comments: [], _data: paint(1200, 900, Math.floor(Math.random() * 8), "") };
        state.photos.unshift(p); save(); return latency(pub(p));
      },
      _reset: function () { try { localStorage.removeItem(KEY); } catch (e) {} state = seedState(); state.v = 5; save(); }
    };
    // A real backend always answers with a Promise; make the mock's synchronous throws behave the same way.
    Object.keys(api).forEach(function (k) { var fn = api[k]; if (k === "onChange" || k === "photoUrl" || k.charAt(0) === "_") return; api[k] = function () { try { return Promise.resolve(fn.apply(api, arguments)); } catch (e) { return Promise.reject(e); } }; });
    return api;
  }
  root.BasecampBondingMock = { create: create };
})(typeof window !== "undefined" ? window : this);
