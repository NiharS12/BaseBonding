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
    ["f1", "Nihar Shankar", "Sample Org · Sample Location"],
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
    // Real sample photos from public/bonding/demo (demo only; not copied into Pulse). [file, w, h, bytes]
    var PIC = { "dolores-1": ["dolores-1.jpg", 300, 300, 22615], "dolores-2": ["dolores-2.jpg", 425, 470, 61850], "dolores-3": ["dolores-3.jpg", 640, 479, 32382], "dolores-4": ["dolores-4.jpg", 402, 497, 49427],
      "bowling-1": ["bowling-1.jpg", 510, 392, 41258], "bowling-2": ["bowling-2.webp", 1920, 1080, 202370], "sf-1": ["sf-1.jpg", 365, 547, 33010], "sf-2": ["sf-2.jpg", 1200, 1303, 248036], "sf-3": ["sf-3.jpg", 1600, 899, 259198] };
    var GEO = { picnic: [37.7596, -122.4269], bowling: [37.7647, -122.4175], sf: [37.8024, -122.4058] }; // Dolores Park, Mission Bowling Club, Coit Tower
    var ph = function (pic, eventId, uploader, tags, source, created, caption) {
      var f = PIC[pic], g = source === "sms" ? null : GEO[eventId === picnic ? "picnic" : eventId === bowling ? "bowling" : "sf"];
      photos.push({ id: uid(), event_id: eventId, uploader_id: uploader, filename: f[0], content_type: /webp$/.test(f[0]) ? "image/webp" : "image/jpeg",
        bytes: f[3], width: f[1], height: f[2], caption: caption || "", taken_at: created - 20 * 60e3, lat: g ? g[0] : null, lng: g ? g[1] : null, source: source || "app", status: "ok",
        created_at: created, tags: tags, reactions: [], comments: [], _data: "/bonding/demo/" + f[0] });
    };
    ph("dolores-1", picnic, "f3", ["f1", "f2", "f3"], "app", t - 3 * D - 2 * H, "Upper lawn crew");
    ph("dolores-2", picnic, "f2", ["f4"], "app", t - 3 * D - 1.5 * H);
    ph("dolores-3", picnic, "f4", ["f1", "f4", "f7"], "slack", t - 3 * D - H);
    ph("dolores-4", picnic, "f7", [], "app", t - 3 * D - 0.5 * H, "Golden hour");
    ph("bowling-1", bowling, "f6", ["f1", "f5", "f6", "f8"], "app", t - 6 * D - H);
    ph("bowling-2", bowling, "f1", ["f5"], "sms", t - 6 * D - 0.5 * H);
    ph("sf-1", null, "f8", ["f8", "f2"], "app", t - 8 * D, "First week in the city");
    ph("sf-2", null, "f5", [], "app", t - 9 * D);
    ph("sf-3", null, "f2", ["f1"], "app", t - 10 * D, "View from the walk back");
    photos[0].reactions = [{ emoji: "❤️", fellow_id: "f2" }, { emoji: "🔥", fellow_id: "f4" }];
    photos[0].comments = [{ id: uid(), fellow_id: "f2", text: "Frame this one", created_at: t - 3 * D, reactions: [] }];
    return { fellows: FELLOWS, events: events, photos: photos, inbound: { slackChannel: "#cohort-photos", smsNumber: "+14155550199", email: "photos@basecamppulse.com", contactUrl: null }, autoPost: {}, features: { verifyAttendance: false } };
  }

  function create(opts) {
    opts = opts || {};
    var meId = opts.me || "f1";
    var state = null;
    try { state = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
    if (!state || state.v !== 8) { state = seedState(); state.v = 8; save(); }
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
    function verifyOn() { return !!(state.features && state.features.verifyAttendance); } // off by default; demo bar "Verify attendance"
    function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
    var EMOJIS = ["🔥", "❤️", "😂", "👏", "🙌"];
    function live(id) { var e = event(id); if (e.cancelled) throw err("gone"); return e; } // writes to a cancelled event: gone, like the Worker's eventRow()
    function canManage(p) { var e = p.event_id && state.events.find(function (x) { return x.id === p.event_id; }); return p.uploader_id === meId || !!(e && e.host_id === meId); }
    // Caption → album, the same rules as routeCaption() in worker/src/inbound.js: every #tag in order (#cohort, event id or
    // id prefix, slug prefix, or a later word of the title), cancelled events excluded; else best title-word overlap within ±3 days.
    function routeCaption(caption) {
      caption = String(caption || "").trim();
      var events = state.events.filter(function (e) { return !e.cancelled; });
      var tags = []; caption.replace(/(^|\s)#([a-z0-9][a-z0-9_-]*)/gi, function (m, pre, t) { tags.push(t.toLowerCase()); return m; });
      var strip = function (tag) { return caption.replace(new RegExp("(^|\\s)#" + tag + "\\b", "i"), "$1").replace(/\s+/g, " ").trim(); };
      for (var i = 0; i < tags.length; i++) {
        var tag = tags[i]; if (tag === "cohort") return { eventId: null, label: "Cohort album", caption: strip(tag) };
        var sl = slug(tag), hit = events.find(function (e) { return e.id === tag || e.id.indexOf(tag) === 0 || slug(e.title).indexOf(sl) === 0 || slug(e.title).indexOf("-" + sl) >= 0; });
        if (hit) return { eventId: hit.id, label: hit.title, caption: strip(tag) };
      }
      var near = events.filter(function (e) { return Math.abs(e.starts_at - now()) <= 3 * D; });
      if (caption && near.length) {
        var words = slug(caption).split("-").filter(function (w) { return w.length > 2; }), best = null, bestScore = 0;
        near.forEach(function (e) { var score = slug(e.title).split("-").filter(function (w) { return w.length > 2 && words.indexOf(w) >= 0; }).length; if (score > bestScore) { best = e; bestScore = score; } });
        if (best) return { eventId: best.id, label: best.title, caption: caption };
      }
      return { eventId: null, label: "Cohort album", caption: caption };
    }

    var api = {
      load: function () {
        var cutoff = now() - 24 * H; state.photos.forEach(function (p) { if (p.status === "pending" && p.created_at < cutoff) p.status = "ok"; }); save();
        var evs = state.events.map(function (e) { var o = withCounts(e); if (e.host_id !== meId) { delete o.checkin_token; delete o.checkin_pin; } return o; });
        var phs = state.photos.filter(function (p) { return p.status === "ok" || p.uploader_id === meId; }).map(pub);
        return latency({ me: me(), fellows: state.fellows, events: evs, photos: phs, inbound: Object.assign({}, state.inbound, { autoPost: !!(state.autoPost || {})[meId] }), features: { verifyAttendance: verifyOn() }, serverTime: now() }); },
      setInboundAuto: function (on) { state.autoPost = state.autoPost || {}; state.autoPost[meId] = !!on; save(); return latency({ autoPost: !!on }); },
      onChange: function (fn) { listeners.push(fn); },
      createEvent: function (f) {
        if (!f.title) throw err("bad_text"); if (!f.starts_at) throw err("bad_time"); if (f.ends_at && +f.ends_at < +f.starts_at) throw err("bad_time");
        var e = { id: uid(), title: f.title, description: f.description || "", starts_at: +f.starts_at, ends_at: +(f.ends_at || f.starts_at + 2 * H), location: f.location || "", location_url: f.location_url || "",
          host_id: meId, cancelled: false, created_at: now(), updated_at: now(), invites: (f.invites || []).filter(function (x, i, a) { return x !== meId && a.indexOf(x) === i; }), rsvps: [{ fellow_id: meId, status: "going" }], attendance: [], vouches: [], reactions: [], comments: [], checkin_token: Math.random().toString(36).slice(2, 10), checkin_pin: pin() };
        state.events.unshift(e); save(); return latency(withCounts(e));
      },
      updateEvent: function (id, f) { var e = live(id); if (e.host_id !== meId) throw err("not_host"); if (f.ends_at && +f.ends_at < +(f.starts_at || e.starts_at)) throw err("bad_time"); ["title", "description", "location", "location_url"].forEach(function (k) { if (k in f) e[k] = f[k]; }); if (f.starts_at) e.starts_at = +f.starts_at; if (f.ends_at) e.ends_at = +f.ends_at; if (f.invites) e.invites = f.invites.filter(function (x, i, a) { return x !== meId && a.indexOf(x) === i; }); touch(e); save(); return latency(withCounts(e)); },
      cancelEvent: function (id) { var e = event(id); if (e.host_id !== meId) throw err("not_host"); e.cancelled = true; touch(e); save(); return latency(withCounts(e)); },
      rsvp: function (id, status) { var e = live(id); if (["going", "maybe", "no", "none"].indexOf(status) < 0) throw err("bad_status"); e.rsvps = e.rsvps.filter(function (r) { return r.fellow_id !== meId; }); if (status && status !== "none") e.rsvps.push({ fellow_id: meId, status: status }); touch(e); save(); return latency(withCounts(e)); },
      invite: function (id, ids) { var e = live(id); ids.forEach(function (x) { if (e.invites.indexOf(x) < 0) e.invites.push(x); }); touch(e); save(); return latency(withCounts(e)); },
      attend: function (id) {
        var e = live(id); if (now() < e.starts_at - 30 * 60e3) throw err("window_closed");
        var a = att(e, meId);
        if (!verifyOn()) { // off: counted at once, any time after the window opens
          if (a && a.status === "confirmed") return latency(withCounts(e));
          if (a) e.attendance.splice(e.attendance.indexOf(a), 1);
          e.attendance.push({ fellow_id: meId, status: "confirmed", via: "tap", late: !windowOpen(e), created_at: now(), confirmed_at: now() }); touch(e); save(); return latency(withCounts(e));
        }
        if (!windowOpen(e)) throw err("window_closed");
        if (a && a.status !== "denied") return latency(withCounts(e)); // already claimed/confirmed: idempotent
        if (a) e.attendance.splice(e.attendance.indexOf(a), 1);
        var host = e.host_id === meId; e.attendance.push({ fellow_id: meId, status: host ? "confirmed" : "claimed", via: host ? "host" : "tap", late: false, created_at: now(), confirmed_at: host ? now() : null }); touch(e); save(); return latency(withCounts(e)); },
      attendLate: function (id, o) {
        var e = live(id); o = o || {}; if (now() < e.starts_at - 30 * 60e3) throw err("window_closed"); if (!verifyOn() || windowOpen(e)) return api.attend(id);
        var cur = att(e, meId); if (cur && cur.status === "confirmed") return latency(withCounts(e));
        var tagged = state.photos.some(function (p) { return p.event_id === id && p.status === "ok" && p.tags.indexOf(meId) >= 0 && (!o.photoId || p.id === o.photoId); });
        if (cur && cur.status !== "denied" && !tagged) return latency(withCounts(e)); // still pending: nothing changes (a denied claim may be re-sent, like the Worker)
        if (cur) e.attendance.splice(e.attendance.indexOf(cur), 1);
        e.attendance.push({ fellow_id: meId, status: tagged ? "confirmed" : "pending", via: tagged ? "photo" : "tap", late: true, created_at: now(), confirmed_at: tagged ? now() : null });
        touch(e); save(); return latency(withCounts(e));
      },
      confirmAttendance: function (id, fid, ok) { var e = event(id); if (e.host_id !== meId) throw err("not_host"); var a = att(e, fid); if (!a) throw err("gone"); if (ok) { if (a.status !== "confirmed") { a.status = "confirmed"; a.via = "host"; a.confirmed_at = now(); } } else if (a.late) { a.status = "denied"; a.confirmed_at = null; } else { e.attendance.splice(e.attendance.indexOf(a), 1); } touch(e); save(); return latency(withCounts(e)); },
      vouch: function (id, fid) {
        var e = event(id); if (fid === meId) throw err("not_allowed"); var mine = att(e, meId); if (!mine || mine.status !== "confirmed") throw err("not_allowed");
        var a = att(e, fid); if (!a) throw err("gone"); if (a.status === "confirmed") throw err("already");
        if (e.vouches.some(function (v) { return v.fellow_id === fid && v.voucher_id === meId; })) throw err("already");
        e.vouches.push({ fellow_id: fid, voucher_id: meId });
        if (e.vouches.filter(function (v) { return v.fellow_id === fid; }).length >= 2) { a.status = "confirmed"; a.via = "vouch"; a.confirmed_at = now(); }
        touch(e); save(); return latency(withCounts(e));
      },
      checkin: function (code) {
        var raw = String(code || "").trim().replace(/^#?bb-checkin-/, ""); var m = /^(.+)-([^-]+)$/.exec(raw);
        var e = m ? state.events.find(function (x) { return x.id === m[1] && !x.cancelled && (x.checkin_token === m[2] || x.checkin_pin === m[2]); })
                  : state.events.find(function (x) { return x.checkin_token === raw && !x.cancelled; });
        if (!e) throw err("bad_code");
        var via = m && m[2] === e.checkin_pin && m[2] !== e.checkin_token ? "code" : "qr";
        var late = now() > e.ends_at + 48 * H; // "late" only after the window closes; a scan before the event starts is not late (same as the Worker)
        var a = att(e, meId); if (a && a.status === "confirmed") return latency(withCounts(e));
        if (a) { a.status = "confirmed"; a.via = via; a.late = late; a.confirmed_at = now(); } else e.attendance.push({ fellow_id: meId, status: "confirmed", via: via, late: late, created_at: now(), confirmed_at: now() });
        touch(e); save(); return latency(withCounts(e));
      },
      newCheckinCode: function (id) { var e = live(id); if (e.host_id !== meId) throw err("not_host"); e.checkin_token = Math.random().toString(36).slice(2, 10); e.checkin_pin = pin(); save(); return latency({ code: e.id + "-" + e.checkin_token, pin: e.checkin_pin }); },
      checkinCode: function (id) { var e = event(id); if (e.host_id !== meId) throw err("not_host"); return latency({ code: e.id + "-" + e.checkin_token, pin: e.checkin_pin }); },
      react: function (t, emoji, on) { if (EMOJIS.indexOf(emoji) < 0) throw err("bad_emoji"); var x = target(t); x.reactions = (x.reactions || []).filter(function (r) { return !(r.fellow_id === meId && r.emoji === emoji); }); if (on) x.reactions.push({ emoji: emoji, fellow_id: meId }); save(); return latency(t.type === "photo" ? pub(x) : x); },
      comment: function (t, text) {
        text = String(text || "").trim(); if (!text || text.length > 1000) throw err("bad_text"); if (t.type !== "event" && t.type !== "photo") throw err("bad_target"); var x = target(t);
        // The Worker refuses more than 5 comments in 10 s from one fellow (slow_down); the demo does the same.
        var recent = 0, cutoff = now() - 10e3; state.events.concat(state.photos).forEach(function (o) { o.comments.forEach(function (c) { if (c.fellow_id === meId && c.created_at > cutoff) recent++; }); });
        if (recent >= 5) throw err("slow_down");
        var c = { id: uid(), fellow_id: meId, text: text, created_at: now(), reactions: [] }; x.comments.push(c); save(); return latency(c); },
      deleteComment: function (id) { var c = target({ type: "comment", id: id }); var hostOf = state.events.some(function (e) { return e.host_id === meId && (e.comments.indexOf(c) >= 0 || state.photos.some(function (p) { return p.event_id === e.id && p.comments.indexOf(c) >= 0; })); }); if (c.fellow_id !== meId && !hostOf) throw err("not_allowed"); c.deleted = true; c.text = ""; save(); return latency({ ok: true }); },
      uploadPhoto: function (file, o) {
        o = o || {}; if (o.eventId) live(o.eventId);
        return new Promise(function (ok, no) {
          if (file.size > 25 * 1024 * 1024) return no(err("too_big"));
          if (file.type && !/^image\//i.test(file.type)) return no(err("bad_file"));
          var r = new FileReader();
          r.onload = function () {
            var p = { id: uid(), event_id: o.eventId || null, uploader_id: meId, filename: file.name || "photo.jpg", content_type: file.type || "image/jpeg", bytes: file.size, width: o.width || 0, height: o.height || 0,
              caption: o.caption || "", taken_at: o.taken_at || null, lat: o.lat != null ? o.lat : null, lng: o.lng != null ? o.lng : null, source: "app", status: "ok", created_at: now(), tags: o.tags || [], reactions: [], comments: [], _data: String(r.result), _thumb: o.thumb || null };
            state.photos.unshift(p); save(); setTimeout(function () { ok(pub(p)); }, 300);
          };
          r.onerror = function () { no(err("bad_photo")); };
          r.readAsDataURL(file);
        });
      },
      replacePhoto: function (id, file, o) {
        o = o || {}; var p = photo(id); if (p.uploader_id !== meId) throw err("not_allowed"); if (file.size > 25 * 1024 * 1024) throw err("too_big"); if (file.type && !/^image\//i.test(file.type)) throw err("bad_file");
        return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { p._data = String(r.result); p._thumb = o.thumb || null; p.filename = file.name || p.filename; p.bytes = file.size; p.width = o.width || p.width; p.height = o.height || p.height; p.taken_at = o.taken_at || p.taken_at; if (o.lat != null && o.lng != null) { p.lat = o.lat; p.lng = o.lng; } p.source = "app"; save(); setTimeout(function () { ok(pub(p)); }, 300); }; r.onerror = function () { no(err("bad_photo")); }; r.readAsDataURL(file); });
      },
      photoUrl: function (id, o) { var p = photo(id); var size = (o && o.size) || "thumb"; if (size === "thumb" && p._thumb) return p._thumb; return p._data; },
      downloadAlbum: function (o) {
        o = o || {}; var list = state.photos.filter(function (p) { return p.status === "ok" && (o.eventId ? p.event_id === o.eventId : o.tagged ? p.tags.indexOf(meId) >= 0 : true); });
        return latency(list.map(function (p) { return { id: p.id, url: p._data, filename: p.filename, created_at: p.created_at }; }));
      },
      updatePhoto: function (id, f) { var p = photo(id); if (("caption" in f || "eventId" in f) && !canManage(p)) throw err("not_allowed"); if ("eventId" in f && f.eventId) live(f.eventId); if ("caption" in f) p.caption = String(f.caption || "").slice(0, 500); if (f.tags) p.tags = f.tags; if ("eventId" in f) p.event_id = f.eventId || null; save(); return latency(pub(p)); },
      untagMe: function (id) { var p = photo(id); p.tags = p.tags.filter(function (x) { return x !== meId; }); save(); return latency(pub(p)); },
      deletePhoto: function (id) { var p = photo(id); var e = p.event_id && state.events.find(function (x) { return x.id === p.event_id; }); if (p.uploader_id !== meId && !(e && e.host_id === meId)) throw err("not_allowed"); state.photos = state.photos.filter(function (x) { return x.id !== id; }); save(); return latency({ ok: true }); },
      confirmInbound: function (id, o) { var p = photo(id); if (p.uploader_id !== meId) throw err("not_allowed"); if (o && o.eventId) live(o.eventId); p.status = "ok"; if (o && "eventId" in o) p.event_id = o.eventId || null; save(); return latency(pub(p)); },
      discardInbound: function (id) { var p = photo(id); if (p.uploader_id !== meId || p.status !== "pending") throw err("not_allowed"); return api.deletePhoto(id); },
      // Demo helpers (not part of the contract)
      _switchTo: function (id) { meId = id; },
      // Demo bar "Simulate a texted plan": the same parser the Worker uses, the event hosted by whoever "You are".
      _simulatePlan: function (text) {
        var P = (typeof window !== "undefined" ? window : globalThis).BasecampBondingPlan; var r = P && P.parse(text, now());
        if (!r) return Promise.reject(err("no_plan"));
        return api.createEvent({ title: r.title, starts_at: r.starts_at, ends_at: r.ends_at, location: r.location, description: "Sent by text from " + me().name + ": \"" + String(text).trim().slice(0, 300) + "\"" })
          .then(function (e) { return { event: e, summary: r.title + " · " + r.when + (r.location ? " · " + r.location : "") }; });
      },
      _setVerify: function (on) { state.features = state.features || {}; state.features.verifyAttendance = !!on; save(); },
      // Demo bar "Simulate a … photo": source is slack | sms | email, the three channels the Worker stores (inbound.js).
      // Like the Worker, the photo lands with no thumb, routed by the caption's #tag, pending unless "Post mine automatically" is on.
      _simulateInbound: function (source, caption) {
        if (["slack", "sms", "email"].indexOf(source) < 0) throw err("bad_target");
        var route = routeCaption(caption);
        var sms = source === "sms"; // MMS arrives carrier-compressed; Slack and Mail keep the full file
        var p = { id: uid(), event_id: route.eventId, uploader_id: meId, filename: source + "-" + Date.now() + ".jpg", content_type: "image/jpeg", bytes: sms ? 380000 : 2900000, width: sms ? 1200 : 4032, height: sms ? 900 : 3024, caption: route.caption, taken_at: null, lat: null, lng: null, source: source, status: (state.autoPost || {})[meId] ? "ok" : "pending", created_at: now(), tags: [], reactions: [], comments: [], _data: paint(1200, 900, Math.floor(Math.random() * 8), "") };
        state.photos.unshift(p); save(); var out = pub(p); out._album = route.label; return latency(out);
      },
      _reset: function () { try { localStorage.removeItem(KEY); } catch (e) {} state = seedState(); state.v = 8; save(); }
    };
    // A real backend always answers with a Promise; make the mock's synchronous throws behave the same way.
    Object.keys(api).forEach(function (k) { var fn = api[k]; if (k === "onChange" || k === "photoUrl" || k.charAt(0) === "_") return; api[k] = function () { try { return Promise.resolve(fn.apply(api, arguments)); } catch (e) { return Promise.reject(e); } }; });
    return api;
  }
  root.BasecampBondingMock = { create: create };
})(typeof window !== "undefined" ? window : this);
