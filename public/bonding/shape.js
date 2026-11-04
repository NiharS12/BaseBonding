/*
 * Basecamp Bonding: the wire ↔ module translation, shared by pulse-adapter/bonding.js (inside Pulse) and
 * public/bonding/worker-api.js (the demo against the reference Worker). The Worker speaks ISO strings and
 * returns vouches as { fellowId: count }; the module wants epoch milliseconds and arrays.
 *
 *   BasecampBondingShape.fromServer.load(data)   -> what BasecampBonding.mount expects from api.load()
 *   BasecampBondingShape.fromServer.event(e) / photo(p) / comment(c)
 *   BasecampBondingShape.toServer.eventFields(f) -> ISO dates for bbcreateevent / bbupdateevent
 *   BasecampBondingShape.dataUrlToBlob(dataUrl)  -> Blob (for the client-made thumb)
 */
(function (root) {
  "use strict";
  var ms = function (v) { if (v == null || v === "") return v == null ? null : v; if (typeof v === "number") return v; var t = Date.parse(v); return isNaN(t) ? null : t; };
  var iso = function (v) { if (v == null || v === "") return v; return typeof v === "number" ? new Date(v).toISOString() : v; };

  function comment(c) { return Object.assign({}, c, { created_at: ms(c.created_at), reactions: c.reactions || [] }); }
  function event(e) {
    var vouches = e.vouches;
    if (vouches && !Array.isArray(vouches)) {
      var arr = []; Object.keys(vouches).forEach(function (fid) { for (var i = 0; i < (vouches[fid] | 0); i++) arr.push({ fellow_id: fid, voucher_id: null }); }); vouches = arr;
    }
    return Object.assign({}, e, {
      starts_at: ms(e.starts_at), ends_at: ms(e.ends_at), created_at: ms(e.created_at), updated_at: ms(e.updated_at),
      description: e.description || "", location: e.location || "", location_url: e.location_url || "",
      cancelled: !!e.cancelled, invites: e.invites || [], rsvps: e.rsvps || [], reactions: e.reactions || [], vouches: vouches || [],
      attendance: (e.attendance || []).map(function (a) { return Object.assign({}, a, { late: !!a.late, created_at: ms(a.created_at), confirmed_at: ms(a.confirmed_at) }); }),
      comments: (e.comments || []).map(comment)
    });
  }
  function photo(p) { return Object.assign({}, p, { created_at: ms(p.created_at), taken_at: ms(p.taken_at), tags: p.tags || [], reactions: p.reactions || [], comments: (p.comments || []).map(comment) }); }
  function fellow(f) {
    // Connect's cards carry org + city; show them under the name like the Connect list does.
    var sub = f.sub || [f.org || f.host_org || f.organization, f.city || f.location].filter(Boolean).join(" · ");
    return Object.assign({}, f, { sub: sub || "", photo_url: f.photo_url || null });
  }
  function load(d) {
    return { me: fellow(d.me), fellows: (d.fellows || []).map(fellow), events: (d.events || []).map(event), photos: (d.photos || []).map(photo), inbound: d.inbound || {}, features: d.features || {}, serverTime: ms(d.serverTime) || Date.now() };
  }
  function eventFields(f) {
    var o = Object.assign({}, f);
    if ("starts_at" in o) o.starts_at = iso(o.starts_at);
    if ("ends_at" in o) o.ends_at = iso(o.ends_at);
    return o;
  }
  function dataUrlToBlob(u) {
    if (!u) return null;
    var m = /^data:([^;]+);base64,(.*)$/.exec(u); if (!m) return null;
    var bin = atob(m[2]), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: m[1] });
  }
  root.BasecampBondingShape = { fromServer: { load: load, event: event, photo: photo, comment: comment, fellow: fellow }, toServer: { eventFields: eventFields }, dataUrlToBlob: dataUrlToBlob, ms: ms, iso: iso };
})(typeof window !== "undefined" ? window : this);
