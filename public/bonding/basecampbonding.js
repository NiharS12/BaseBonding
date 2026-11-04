/*
 * Basecamp Bonding, built by Claude Corps fellow Nihar Shankar (Cohort 1). Pulse's Bonding tab.
 * Plain JavaScript, no framework, no build step. Load qr.js first (Pulse already has it for Connect).
 *
 *   var bb = BasecampBonding.mount(el, { api, qrBase });
 *
 * api is an object of Promise-returning functions (see docs/API.md); pulse-adapter/bonding.js maps it to Pulse's
 * /api endpoints and public/bonding/mock-api.js implements it in the browser for the standalone demo.
 *   load() -> { me, fellows, events, photos, inbound, features, serverTime }
 * Everything else is a write that returns the changed object. The module polls load() (15 s, 5 s around a live
 * event) and re-renders in place, so two phones see the same calendar within a few seconds.
 * Returns { reload(), openCheckinLink(code), destroy() }.
 * opts.verifyAttendance (optional boolean) forces attendance verification on or off; by default the backend decides
 * via load().features.verifyAttendance, and the default there is off.
 */
(function (root) {
  "use strict";

  const EMOJI = ["🔥", "❤️", "😂", "👏", "🙌"];
  const H = 3600e3, D = 24 * H, MIN = 60e3;
  const WINDOW_BEFORE = 30 * MIN, WINDOW_AFTER = 48 * H;
  const JSZIP = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
  const PIEXIF = "https://cdnjs.cloudflare.com/ajax/libs/piexifjs/1.0.6/piexif.min.js";

  /* ---------- tiny DOM helpers ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v === null || v === undefined || (v === false && !k.startsWith("aria-") && !k.startsWith("data-"))) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("aria-") || k.startsWith("data-")) el.setAttribute(k, String(v)); // "true"/"false" are the values here
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of kids) add(el, c);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(x => add(el, x)); return; }
    el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  }
  const svg = (paths, extra) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra || ""}>${paths}</svg>`;
  const ICONS = {
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    pin: svg('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
    user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'),
    users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 20c0-3-2-5.2-5-5.8"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', ' stroke-width="3"'),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    download: svg('<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>'),
    left: svg('<path d="M15 5l-7 7 7 7"/>'),
    right: svg('<path d="M9 5l7 7-7 7"/>'),
    qr: svg('<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2"/>'),
    message: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    edit: svg('<path d="M4 20h4l11-11-4-4L4 16z"/>'),
    tag: svg('<path d="M3 12V3h9l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>'),
    send: svg('<path d="M21 3L3 10l8 3 3 8z"/>'),
    link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
    photo: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>'),
    upload: svg('<path d="M12 16V5M7 10l5-5 5 5M4 20h16"/>'),
    chevron: svg('<path d="M6 9l6 6 6-6"/>'),
    hand: svg('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 5a1.5 1.5 0 0 1 3 0v6M14 6.5a1.5 1.5 0 0 1 3 0V12M17 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.7L4.3 14a1.6 1.6 0 0 1 2.6-1.8L8 13.5"/>'),
    slack: svg('<path d="M9 3a2 2 0 0 0 0 4h2V5a2 2 0 0 0-2-2zM3 11a2 2 0 0 0 4 0V9H5a2 2 0 0 0-2 2zM15 21a2 2 0 0 0 0-4h-2v2a2 2 0 0 0 2 2zM21 13a2 2 0 0 0-4 0v2h2a2 2 0 0 0 2-2zM9 9H5v4h4zM15 15h4v-4h-4zM9 15v4h4v-4zM15 9V5h-4v4z"/>'),
    phone: svg('<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18h2"/>')
  };
  function icon(name) { const s = document.createElement("span"); s.style.display = "contents"; s.innerHTML = ICONS[name]; return s; }

  /* ---------- formatting ---------- */
  const initials = name => { const p = String(name || "?").trim().split(/\s+/); return ((p[0] ? p[0][0] : "?") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); };
  const sameDay = (a, b) => { a = new Date(a); b = new Date(b); return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };
  const fmtTime = t => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).replace(/\s?([AP])M/i, (m, x) => x.toLowerCase() + "m").replace(":00", "");
  const mapUrl = (lat, lng) => (/iPhone|iPad|Macintosh/.test(navigator.userAgent) ? "https://maps.apple.com/?ll=" : "https://www.google.com/maps?q=") + lat + "," + lng;
  const fmtDay = t => new Date(t).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  function dayWord(t, now) {
    if (sameDay(t, now)) return new Date(t).getHours() >= 17 ? "Tonight" : "Today";
    if (sameDay(t, now + D)) return "Tomorrow";
    if (sameDay(t, now - D)) return "Yesterday";
    return fmtDay(t);
  }
  function fmtWhen(e, now) {
    if (now >= e.starts_at && now <= e.ends_at) return "Happening now · until " + fmtTime(e.ends_at);
    return dayWord(e.starts_at, now) + " · " + fmtTime(e.starts_at) + (e.ends_at > e.starts_at ? " – " + fmtTime(e.ends_at) : "");
  }
  function ago(t, now) {
    const d = Math.max(0, now - t);
    if (d < MIN) return "just now";
    if (d < H) return Math.round(d / MIN) + "m ago";
    if (d < D) return Math.round(d / H) + "h ago";
    if (d < 7 * D) return Math.round(d / D) + "d ago";
    return fmtDay(t);
  }
  const fmtPhone = n => { const d = String(n || "").replace(/\D/g, ""); return d.length === 11 && d[0] === "1" ? "(" + d.slice(1, 4) + ") " + d.slice(4, 7) + "-" + d.slice(7) : d.length === 10 ? "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6) : String(n || ""); };
  const fmtBytes = b => b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB";
  const plural = (n, w, ws) => n + " " + (n === 1 ? w : ws || w + "s");
  const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const toLocalInput = t => { const d = new Date(t); const p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()); };
  const safeImg = u => (u && /^(data:image\/(png|jpe?g|webp|gif);|blob:)/i.test(u)) ? u : safeUrl(u); // same rule as CorpsConnect
  const safeUrl = u => { if (!u) return null; try { const x = new URL(u, location.href); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch (e) { return null; } };
  const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

  // 400px JPEG thumb for the grid; the original file is uploaded untouched.
  function makeThumb(file) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const w = img.naturalWidth, hh = img.naturalHeight, s = Math.min(w, hh), size = 400, c = document.createElement("canvas");
        c.width = size; c.height = size;
        c.getContext("2d").drawImage(img, (w - s) / 2, (hh - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve({ thumb: c.toDataURL("image/jpeg", 0.8), width: w, height: hh });
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve({ thumb: null, width: 0, height: 0 }); };
      img.src = url;
    });
  }
  const scriptOnce = {};
  function loadScript(src, globalName) {
    if (root[globalName]) return Promise.resolve(root[globalName]);
    if (!scriptOnce[src]) scriptOnce[src] = new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = () => ok(root[globalName]); s.onerror = () => { delete scriptOnce[src]; no(new Error("Couldn't load a helper. Check the connection and try again.")); }; document.head.append(s); });
    return scriptOnce[src];
  }

  /* ---------- photo metadata: the moment it was taken, and the caption, travel with the file ---------- */
  const exifDate = t => { const d = new Date(t), p = n => String(n).padStart(2, "0"); return d.getFullYear() + ":" + p(d.getMonth() + 1) + ":" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()); };
  const parseExifDate = s => { const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s || ""); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : null; };
  const blobToBinary = blob => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsBinaryString(blob); });
  const binaryToBlob = (bin, type) => { const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type }); };
  // When and where was this taken? EXIF DateTimeOriginal + GPS for JPEGs. (iOS strips GPS from photos picked in Safari unless
  // the picker's Options → Location is on; the Worker re-reads the file anyway, so this is just a head start.)
  function readExifMeta(file) {
    const fallback = { taken_at: file.lastModified || null, lat: null, lng: null };
    if (!/^image\/jpe?g$/i.test(file.type)) return Promise.resolve(fallback);
    return loadScript(PIEXIF, "piexif").then(piexif => blobToBinary(file.slice(0, 256 * 1024)).then(head => {
      try {
        const ex = piexif.load(head), g = ex.GPS || {};
        const s = ex.Exif[piexif.ExifIFD.DateTimeOriginal] || ex["0th"][piexif.ImageIFD.DateTime];
        let lat = null, lng = null;
        if (g[piexif.GPSIFD.GPSLatitude] && g[piexif.GPSIFD.GPSLongitude]) {
          lat = piexif.GPSHelper.dmsRationalToDeg(g[piexif.GPSIFD.GPSLatitude], g[piexif.GPSIFD.GPSLatitudeRef] || "N");
          lng = piexif.GPSHelper.dmsRationalToDeg(g[piexif.GPSIFD.GPSLongitude], g[piexif.GPSIFD.GPSLongitudeRef] || "E");
          if (!isFinite(lat) || !isFinite(lng) || (!lat && !lng)) lat = lng = null;
        }
        return { taken_at: parseExifDate(s) || file.lastModified || null, lat, lng };
      } catch (e) { return fallback; }
    })).catch(() => fallback);
  }
  function readTakenAt(file) {
    if (!/^image\/jpe?g$/i.test(file.type)) return Promise.resolve(file.lastModified || null);
    return loadScript(PIEXIF, "piexif").then(piexif => blobToBinary(file.slice(0, 256 * 1024)).then(head => {
      try { const ex = piexif.load(head); const s = ex.Exif[piexif.ExifIFD.DateTimeOriginal] || ex["0th"][piexif.ImageIFD.DateTime]; return parseExifDate(s) || file.lastModified || null; } catch (e) { return file.lastModified || null; }
    })).catch(() => file.lastModified || null);
  }
  // IPTC Caption/Abstract + date created, in an APP13 segment: this is the field the Photos app shows as "Caption".
  function iptcSegment(caption, takenAt) {
    const enc = new TextEncoder(), ds = (rec, tag, bytes) => { const b = new Uint8Array(5 + bytes.length); b.set([0x1c, rec, tag, bytes.length >> 8, bytes.length & 255]); b.set(bytes, 5); return b; };
    const parts = [ds(1, 90, enc.encode("\x1b%G")), ds(2, 0, new Uint8Array([0, 4]))];
    if (caption) parts.push(ds(2, 120, enc.encode(caption.slice(0, 2000))));
    if (takenAt) { const d = new Date(takenAt), p = n => String(n).padStart(2, "0"); parts.push(ds(2, 55, enc.encode(d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())))); parts.push(ds(2, 60, enc.encode(p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())))); }
    const iptc = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; parts.forEach(p => { iptc.set(p, o); o += p.length; });
    const head = enc.encode("Photoshop 3.0\u00008BIM"), res = new Uint8Array(head.length + 2 + 2 + 4 + iptc.length + (iptc.length % 2));
    res.set(head); res.set([0x04, 0x04, 0, 0], head.length); const L = iptc.length; res.set([L >>> 24, (L >> 16) & 255, (L >> 8) & 255, L & 255], head.length + 4); res.set(iptc, head.length + 8);
    const seg = new Uint8Array(4 + res.length); const n = res.length + 2; seg.set([0xff, 0xed, n >> 8, n & 255]); seg.set(res, 4);
    return seg;
  }
  // Give a JPEG the caption and taken-date it has on Pulse, without re-encoding a single pixel. Other formats pass through.
  function stampJpeg(blob, p) {
    const takenAt = p.taken_at || null, caption = (p.caption || "").trim();
    if (!/^image\/jpe?g$/i.test(blob.type) || (!takenAt && !caption)) return Promise.resolve(blob);
    return loadScript(PIEXIF, "piexif").then(piexif => blobToBinary(blob).then(bin => {
      let ex; try { ex = piexif.load(bin); } catch (e) { ex = { "0th": {}, Exif: {}, GPS: {}, "1st": {}, thumbnail: null }; }
      if (caption) ex["0th"][piexif.ImageIFD.ImageDescription] = caption;
      if (takenAt) { const s = exifDate(takenAt); ex.Exif[piexif.ExifIFD.DateTimeOriginal] ||= s; ex.Exif[piexif.ExifIFD.DateTimeDigitized] ||= s; ex["0th"][piexif.ImageIFD.DateTime] ||= s; }
      let out = piexif.insert(piexif.dump(ex), bin);
      // APP13 goes right after APP1 (SOI + APP1 segment).
      const app1Len = out.charCodeAt(4) * 256 + out.charCodeAt(5), at = out.charCodeAt(2) === 0xff && out.charCodeAt(3) === 0xe1 ? 4 + app1Len : 2;
      const seg = iptcSegment(caption, takenAt); let segStr = ""; for (let i = 0; i < seg.length; i++) segStr += String.fromCharCode(seg[i]);
      out = out.slice(0, at) + segStr + out.slice(at);
      return binaryToBlob(out, "image/jpeg");
    })).catch(() => blob);
  }
  let zipLoading = null;
  function loadZip() {
    if (root.JSZip) return Promise.resolve(root.JSZip);
    if (!zipLoading) zipLoading = new Promise((ok, no) => { const s = document.createElement("script"); s.src = JSZIP; s.onload = () => ok(root.JSZip); s.onerror = () => { zipLoading = null; no(new Error("Couldn't load the zip helper. Check the connection and try again.")); }; document.head.append(s); });
    return zipLoading;
  }
  // Phones: the share sheet's "Save Image(s)" writes straight into the Photos library (iOS 15+, Android). Laptops get a file.
  const canShareFiles = (() => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(1)], "a.jpg", { type: "image/jpeg" })] })); } catch (e) { return false; } })();
  const SHARE_BATCH = 30;
  function saveBlob(blob, name) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  /* ---------- sheet + toast plumbing (same shape as CorpsConnect) ---------- */
  function sheetHost(container) {
    const overlay = h("div", { class: "bb-overlay", hidden: true });
    const toastEl = h("div", { class: "bb-toast", role: "status", hidden: true });
    let lastFocus = null, toastTimer = null, onClose = null, stack = [];
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !overlay.hidden) close(); });
    add(container, [overlay, toastEl]);
    function open(content, label, closing) {
      if (!overlay.hidden && onClose) { const f = onClose; onClose = null; f(); }
      lastFocus = lastFocus || document.activeElement;
      overlay.textContent = "";
      const sheet = h("div", { class: "bb-sheet", role: "dialog", "aria-modal": "true", "aria-label": label, tabindex: "-1" },
        h("div", { class: "bb-sheet-bar" }, h("span", { class: "bb-grabber", "aria-hidden": "true" }),
          h("button", { class: "bb-btn bb-btn-ghost bb-btn-small", type: "button", onclick: close, text: "Close" })),
        content);
      overlay.appendChild(sheet); overlay.hidden = false; onClose = closing || null;
      document.body.classList.add("bb-lock");
      sheet.focus({ preventScroll: true }); sheet.scrollTop = 0;
      return sheet;
    }
    function close() {
      if (onClose) { const f = onClose; onClose = null; f(); }
      overlay.hidden = true; overlay.textContent = "";
      document.body.classList.remove("bb-lock");
      if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
      lastFocus = null;
    }
    function toast(text, undo) {
      if (toastTimer) clearTimeout(toastTimer);
      toastEl.textContent = "";
      add(toastEl, [h("span", { text }), undo ? h("button", { type: "button", text: "Undo", onclick: () => { toastEl.hidden = true; undo(); } }) : null]);
      toastEl.hidden = false;
      toastTimer = setTimeout(() => { toastEl.hidden = true; }, undo ? 6000 : 3500);
    }
    return { open, close, toast, isOpen: () => !overlay.hidden, el: () => overlay.firstChild };
  }

  /* ---------- the app ---------- */
  function mount(container, opts) {
    opts = opts || {};
    const api = opts.api;
    if (!api) throw new Error("BasecampBonding.mount needs an api object");
    const qrBase = opts.qrBase || (location.origin + location.pathname);
    // opts.openConnect(fellow): the host page takes the fellow to their card on the Connect tab. Without it, a plain link.
    const openConnect = typeof opts.openConnect === "function" ? opts.openConnect : f => window.open(opts.connectUrl || "https://basecamppulse.com/", "_blank", "noopener");
    // Attendance verification (host confirm, QR, passcode, late-claim proofs, vouches) is optional and OFF by default.
    // The backend says which (api.load().features.verifyAttendance); opts.verifyAttendance forces it either way.
    const verify = () => opts.verifyAttendance != null ? !!opts.verifyAttendance : !!(S.data && S.data.features && S.data.features.verifyAttendance);
    container.textContent = ""; container.classList.add("bb"); // the container is the themed root; sheets and the lightbox hang off it
    const ui = sheetHost(container);
    const S = { data: null, now: Date.now(), weekStart: startOfWeek(Date.now()), day: null, tab: "upcoming", ptab: "cohort", album: null, taggedOnly: false, error: null, open: null };
    const nodes = {};
    const timers = {};
    let destroyed = false, loading = false, skew = 0;

    function startOfWeek(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
    const me = () => S.data.me;
    const fellow = id => S.data.fellows.find(f => f.id === id) || { id, name: "Someone" };
    const name = id => fellow(id).name;
    const first = id => name(id).split(" ")[0];
    const event = id => S.data.events.find(e => e.id === id);
    const photo = id => S.data.photos.find(p => p.id === id);
    const isHost = e => e.host_id === me().id;
    const myRsvp = e => (e.rsvps.find(r => r.fellow_id === me().id) || {}).status || "none";
    const myAtt = e => e.attendance.find(a => a.fellow_id === me().id);
    const confirmed = e => e.attendance.filter(a => a.status === "confirmed");
    const isLive = e => S.now >= e.starts_at - WINDOW_BEFORE && S.now <= e.ends_at;
    const windowOpen = e => S.now >= e.starts_at - WINDOW_BEFORE && S.now <= e.ends_at + WINDOW_AFTER;
    const eventPhotos = id => S.data.photos.filter(p => p.event_id === id && p.status === "ok");
    const okPhotos = () => S.data.photos.filter(p => p.status === "ok");
    const pendingMine = () => S.data.photos.filter(p => p.status === "pending" && p.uploader_id === me().id);
    const taken = p => p.taken_at || p.created_at;
    const thumbUrl = p => api.photoUrl(p.id, { size: "thumb" });
    const fullUrl = p => api.photoUrl(p.id, { size: "full" });
    const MSG = {
      window_closed: "The check-in window for this event has closed. Use \"I was there too\" instead.",
      not_host: "Only the host can do that.", already: "You're already on the list.", bad_code: "That check-in code didn't work. Ask the host to show it again.",
      gone: "That isn't here anymore.", too_big: "That photo is over 25 MB. Try another one.", bad_photo: "That file isn't a photo we can read.",
      bad_text: "Add a title and a start time.", not_allowed: "You can't do that one.", offline: "You're offline. Try again once you're connected.",
      unreachable: "Couldn't reach Pulse. Check the Wi-Fi and try again.", slow_down: "A lot of taps at once. Try again in a moment.", signed_out: "Sign in to Pulse again, then try once more."
    };
    const why = e => MSG[e && e.code] || (e && e.message && !/^[a-z_]+$/.test(e.message) ? e.message : "Something went wrong. Try again.");

    /* ----- data ----- */
    function load(quiet) {
      if (loading) return Promise.resolve();
      loading = true;
      return api.load().then(d => {
        if (destroyed) return;
        d.events.forEach(e => { e.rsvps ||= []; e.invites ||= []; e.attendance ||= []; e.vouches ||= []; e.reactions ||= []; e.comments ||= []; e.comments.forEach(c => c.reactions ||= []); });
        d.photos.forEach(p => { p.tags ||= []; p.reactions ||= []; p.comments ||= []; p.comments.forEach(c => c.reactions ||= []); });
        if (d.serverTime) skew = d.serverTime - Date.now();
        S.data = d; S.error = null; S.now = Date.now() + skew;
        render();
      }, e => { if (!S.data) { S.error = why(e); render(); } }).finally(() => { loading = false; schedule(); });
    }
    function schedule() {
      clearTimeout(timers.poll);
      if (destroyed) return;
      const live = S.data && S.data.events.some(e => !e.cancelled && Math.abs(S.now - e.starts_at) < 2 * H);
      const every = (live ? 5000 : 15000) * (0.85 + Math.random() * 0.3);
      timers.poll = setTimeout(() => { if (!document.hidden) load(true); else schedule(); }, every);
    }
    const wake = () => { if (!document.hidden && !destroyed) load(true); };
    document.addEventListener("visibilitychange", wake); addEventListener("focus", wake); addEventListener("online", wake);
    if (api.onChange) api.onChange(() => load(true));
    timers.clock = setInterval(() => { S.now = Date.now() + skew; if (S.data && !ui.isOpen()) renderEvents(); }, 30000);

    // Optimistic patch: swap the returned object into state and re-render whatever is open.
    function patchEvent(e) { const i = S.data.events.findIndex(x => x.id === e.id); if (i >= 0) S.data.events[i] = Object.assign(S.data.events[i], e); else S.data.events.unshift(e); render(); }
    function patchPhoto(p) { const i = S.data.photos.findIndex(x => x.id === p.id); if (i >= 0) S.data.photos[i] = Object.assign(S.data.photos[i], p); else S.data.photos.unshift(p); render(); }
    function act(promise, done) { return promise.then(r => { done && done(r); return r; }, e => { ui.toast(why(e)); load(true); throw e; }); }

    /* ----- render ----- */
    function render() {
      if (!nodes.root) {
        nodes.root = h("div", { class: "bb-main" });
        container.prepend(nodes.root); // the sheet overlay and toast already live after it
      }
      const r = nodes.root; r.textContent = "";
      if (S.error) { add(r, h("div", { class: "bb-status" }, h("strong", { text: "Couldn't load Bonding" }), S.error, h("div", { style: { marginTop: "12px" } }, h("button", { class: "bb-btn", type: "button", text: "Try again", onclick: () => load() })))); return; }
      if (!S.data) { add(r, h("div", { class: "bb-status", text: "Loading…" })); return; }
      add(r, [
        h("div", { class: "bb-top" }, h("span", { class: "bb-wordmark", text: "Basecamp Bonding" }),
          h("button", { class: "bb-btn bb-btn-primary", type: "button", onclick: () => openEventForm(null) }, icon("plus"), "Propose an event")),
        pendingBanner(),
        nodes.cal = h("div", { class: "bb-section" }),
        nodes.events = h("div", { class: "bb-section" }),
        nodes.photos = h("div", { class: "bb-section" }),
        inboundCard()
      ]);
      renderCal(); renderEvents(); renderPhotos();
      if (S.open) reopen();
    }
    function pendingBanner() {
      const n = pendingMine().length;
      if (!n) return null;
      return h("div", { class: "bb-banner" }, h("p", {}, h("b", { text: plural(n, "photo") + " arrived" }), " from Slack, text or email. Post them as they came in, or pick albums."),
        h("span", { class: "bb-actions" }, h("button", { class: "bb-btn bb-btn-small bb-btn-dark", type: "button", text: "Post all", onclick: postAllInbound }),
          h("button", { class: "bb-btn bb-btn-small", type: "button", text: "Review", onclick: openInboundReview })));
    }
    function inboundCard() {
      const i = S.data.inbound || {};
      if (!i.slackChannel && !i.smsNumber) return null;
      const auto = !!i.autoPost;
      const ways = [i.slackChannel ? ["post in ", h("code", { text: i.slackChannel })] : null, i.smsNumber ? ["text ", h("code", { text: fmtPhone(i.smsNumber) })] : null, i.email ? ["email ", h("code", { text: i.email })] : null].filter(Boolean);
      const joined = []; ways.forEach((w, k) => { if (k) joined.push(k === ways.length - 1 ? " or " : ", "); joined.push(w); });
      return h("div", { class: "bb-inbound" },
        h("b", {}, icon("send"), "Text Plans Bot a photo, or a plan"),
        h("span", {}, joined.length ? [joined[0] && String(joined[0][0]).charAt(0).toUpperCase() + String(joined[0][0]).slice(1), joined[0] && joined[0].slice(1), joined.slice(1)] : null,
          ". Photos: add ", h("code", { text: "#" + slugify((upcoming()[0] || { title: "event-name" }).title).split("-")[0] }), " to file them under an event, or nothing for the cohort album. Plans: write what, when and where in plain English (\"Tacos at La Taqueria Friday 7pm\") and it goes on the calendar as your event."),
        (i.smsNumber || i.email) ? h("div", { class: "bb-actions" },
          h("button", { class: "bb-btn bb-btn-small bb-btn-dark", type: "button", onclick: () => openContactSheet(i) }, icon("qr"), "Save the contact"),
          i.smsNumber ? h("a", { class: "bb-btn bb-btn-small", href: "sms:" + i.smsNumber }, icon("phone"), "Text it") : null,
          i.email ? h("a", { class: "bb-btn bb-btn-small", href: "mailto:" + i.email + "?subject=" + encodeURIComponent("#cohort") }, icon("send"), "Email it") : null) : null,
        h("div", { class: "bb-row", style: { borderBottom: "0", paddingBottom: "0" } },
          h("span", { class: "bb-row-text" }, h("span", { class: "bb-row-name", text: "Post mine automatically" }), h("span", { class: "bb-row-sub", style: { whiteSpace: "normal" }, text: auto ? "On: your photos go straight into the album named in the caption." : "Off: your photos wait in a review list first (posted anyway after 24 h)." })),
          h("button", { class: "bb-tick", type: "button", "aria-pressed": auto, "aria-label": "Post my Slack and text photos automatically", onclick: () => { S.data.inbound.autoPost = !auto; render(); act(api.setInboundAuto(!auto), r => { if (r && "autoPost" in r) S.data.inbound.autoPost = !!r.autoPost; }); if (!auto && pendingMine().length) postAllInbound(); } }, icon("check"))));
    }
    // "Plans Bot" as a contact: a vCard QR (iPhone and Android cameras offer "Add contact"), a .vcf, and sms:/mailto: links.
    // Once it's a contact, sharing a photo from the camera roll is "Share → Messages/Mail → Plans Bot", and texting it a plan posts an event.
    function vcard(i) {
      const l = ["BEGIN:VCARD", "VERSION:3.0", "N:Bot;Plans;;;", "FN:Plans Bot", "NICKNAME:Flicks Bot", "ORG:Basecamp Pulse"];
      if (i.smsNumber) l.push("TEL;TYPE=CELL:" + i.smsNumber);
      if (i.email) l.push("EMAIL;TYPE=INTERNET:" + i.email);
      l.push("END:VCARD");
      return l.join("\r\n") + "\r\n";
    }
    function openContactSheet(i) {
      const card = vcard(i);
      const box = h("div", { class: "bb-qr" });
      if (root.PulseQR) { try { box.innerHTML = root.PulseQR.svg(card, { color: "#0b0b0b" }); } catch (e) { box.textContent = ""; add(box, h("p", { class: "bb-hint", text: "Use the buttons below." })); } }
      const vcfHref = i.contactUrl || URL.createObjectURL(new Blob([card], { type: "text/vcard" }));
      const content = h("div", { class: "bb-sheet-body" },
        h("div", { class: "bb-intro" }, h("h2", { text: "Save Plans Bot" }), h("p", { text: "One contact for both jobs. Share a photo from your camera roll to \"Plans Bot\" in Messages" + (i.email ? " or Mail" : "") + " and it lands in the album. Text it what, when and where in plain English and it posts the plan to the calendar. iPhone and Android." })),
        box, h("p", { class: "bb-qr-label", text: "Point another phone's camera here to add the contact" }),
        h("ol", { class: "bb-steps" },
          h("li", { text: "Open the Camera app and point it at the code (no need to take a photo)." }),
          h("li", { text: "Tap the \"Add contact\" banner that pops up (Android: \"Add to contacts\")." }),
          h("li", { text: "Keep the name Plans Bot, or call it Flicks Bot if you prefer, then tap Save." }),
          h("li", { text: "Now share any photo to Plans Bot, or text it \"Tacos at La Taqueria Friday 7pm\"." })),
        h("div", { class: "bb-actions", style: { justifyContent: "center" } },
          h("a", { class: "bb-btn bb-btn-primary", href: vcfHref, download: i.contactUrl ? null : "plans-bot.vcf" }, icon("user"), "Add to my contacts"),
          i.smsNumber ? h("a", { class: "bb-btn", href: "sms:" + i.smsNumber + "?&body=" + encodeURIComponent("#cohort ") }, icon("phone"), "Text " + fmtPhone(i.smsNumber)) : null,
          i.email ? h("a", { class: "bb-btn", href: "mailto:" + i.email + "?subject=" + encodeURIComponent("#cohort") }, icon("send"), "Email " + i.email) : null),
        h("p", { class: "bb-hint", text: "Photos: put #event-name in the message (or the email subject) to file them under an event; no tag means the cohort album. Plans: just say what, when and where." }));
      ui.open(content, "Save the contact");
    }
    // Everything waiting in the review list goes into the album it was routed to (caption → event, else cohort).
    function postAllInbound() {
      const list = pendingMine(); if (!list.length) return;
      list.forEach(p => { p.status = "ok"; act(api.confirmInbound(p.id, { eventId: p.event_id || null }), patchPhoto); });
      render(); if (ui.isOpen()) ui.close(); ui.toast("Posted " + plural(list.length, "photo"));
    }

    /* ----- calendar ----- */
    function renderCal() {
      const c = nodes.cal; c.textContent = "";
      const days = []; for (let i = 0; i < 7; i++) days.push(S.weekStart + i * D);
      const label = new Date(S.weekStart).toLocaleDateString(undefined, { month: "long", year: "numeric" });
      add(c, [
        h("div", { class: "bb-weeknav" },
          h("button", { class: "bb-btn bb-btn-ghost bb-btn-small", type: "button", "aria-label": "Previous week", onclick: () => { S.weekStart -= 7 * D; S.day = null; renderCal(); renderEvents(); } }, icon("left")),
          h("strong", { text: label }),
          h("button", { class: "bb-btn bb-btn-ghost bb-btn-small", type: "button", "aria-label": "Next week", onclick: () => { S.weekStart += 7 * D; S.day = null; renderCal(); renderEvents(); } }, icon("right"))),
        h("div", { class: "bb-week", role: "group", "aria-label": "Week" }, days.map(t => {
          const n = S.data.events.filter(e => !e.cancelled && sameDay(e.starts_at, t)).length;
          return h("button", { class: "bb-day", type: "button", "data-has": n > 0, "data-today": sameDay(t, S.now), "aria-pressed": S.day === t, "aria-label": fmtDay(t) + (n ? ", " + plural(n, "event") : ""),
            onclick: () => { S.day = S.day === t ? null : t; renderCal(); renderEvents(); } },
            new Date(t).toLocaleDateString(undefined, { weekday: "short" }), h("b", { text: new Date(t).getDate() }), h("i"));
        }))
      ]);
      if (!sameDay(S.weekStart, startOfWeek(S.now)) ) add(c, h("button", { class: "bb-btn bb-btn-ghost bb-btn-small", type: "button", text: "Back to this week", style: { alignSelf: "center" }, onclick: () => { S.weekStart = startOfWeek(S.now); S.day = null; renderCal(); renderEvents(); } }));
    }
    const upcoming = () => S.data.events.filter(e => e.ends_at >= S.now && !e.cancelled).sort((a, b) => a.starts_at - b.starts_at);
    const past = () => S.data.events.filter(e => e.ends_at < S.now || e.cancelled).sort((a, b) => b.starts_at - a.starts_at);

    /* ----- event list ----- */
    function renderEvents() {
      const c = nodes.events; if (!c) return; c.textContent = "";
      let list;
      if (S.day !== null) list = S.data.events.filter(e => sameDay(e.starts_at, S.day)).sort((a, b) => a.starts_at - b.starts_at);
      else list = S.tab === "upcoming" ? upcoming() : past();
      add(c, [
        S.day === null ? h("div", { class: "bb-tabs", role: "tablist" },
          tab("Upcoming", upcoming().length, S.tab === "upcoming", () => { S.tab = "upcoming"; renderEvents(); }),
          tab("Past", past().length, S.tab === "past", () => { S.tab = "past"; renderEvents(); })) :
          h("div", { class: "bb-section-head" }, h("p", { class: "bb-label", text: fmtDay(S.day) }), h("button", { class: "bb-btn bb-btn-ghost bb-btn-small", type: "button", text: "Show all", onclick: () => { S.day = null; renderCal(); renderEvents(); } })),
        list.length ? h("div", { class: "bb-events" }, list.map(eventCard)) :
          h("div", { class: "bb-empty" }, h("strong", { text: S.day !== null ? "Nothing on this day" : S.tab === "upcoming" ? "Nothing planned yet" : "No past events" }), S.tab === "upcoming" || S.day !== null ? "Propose something and the cohort will see it here." : "")
      ]);
    }
    function tab(label, n, on, click) { return h("button", { class: "bb-tab", role: "tab", type: "button", "aria-selected": on, onclick: click }, label, h("span", { class: "bb-tab-count", text: n })); }
    function avatar(f, size, ok, click) {
      const el = h(click ? "button" : "span", { class: "bb-av" + (size ? " bb-av-" + size : "") + (click ? " bb-avbtn" : ""), type: click ? "button" : null, "data-ok": !!ok, title: f.name + (ok ? " · confirmed there" : ""), "aria-label": click ? f.name : null, "aria-hidden": click ? null : "true",
        onclick: click ? ev => { ev.stopPropagation(); openFellow(f.id); } : null });
      const src = f.photo_url && safeImg(f.photo_url);
      if (src) el.appendChild(h("img", { src, alt: "", loading: "lazy" })); else el.textContent = initials(f.name);
      return el;
    }
    // A name as a button: tap it anywhere to see who that is.
    const nameBtn = (id, text, cls) => h("button", { class: "bb-namebtn" + (cls ? " " + cls : ""), type: "button", text: text || name(id), onclick: ev => { ev.stopPropagation(); openFellow(id); } });
    function avatars(ids, max, okIds) {
      ids = ids.filter((x, i, a) => a.indexOf(x) === i);
      const shown = ids.slice(0, max || 4), more = ids.length - shown.length;
      return h("span", { class: "bb-avs" }, shown.map(id => avatar(fellow(id), null, okIds && okIds.indexOf(id) >= 0, true)), more > 0 ? h("span", { class: "bb-av bb-av-more", text: "+" + more, title: ids.slice(max || 4).map(name).join(", ") }) : null);
    }
    function eventCard(e) {
      const going = e.rsvps.filter(r => r.status === "going").map(r => r.fellow_id), maybe = e.rsvps.filter(r => r.status === "maybe").length;
      const people = going.concat(e.invites).filter(id => id !== e.host_id);
      const conf = confirmed(e).map(a => a.fellow_id);
      return h("div", { class: "bb-event", role: "button", tabindex: "0", "data-cancelled": e.cancelled, onclick: () => openEvent(e.id), onkeydown: ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openEvent(e.id); } } },
        h("span", { class: "bb-when", "data-live": isLive(e), text: e.cancelled ? "Cancelled · " + fmtWhen(e, S.now) : fmtWhen(e, S.now) }),
        h("h3", { text: e.title }),
        h("span", { class: "bb-meta" }, e.location ? h("span", {}, icon("pin"), e.location) : null, h("span", {}, icon("user"), "Hosted by " + first(e.host_id))),
        h("span", { class: "bb-meta" }, avatars([e.host_id].concat(people), 5, conf),
          h("span", { text: e.ends_at < S.now ? plural(conf.length, "fellow") + " there" : (going.length ? going.length + " going" : "No RSVPs yet") + (maybe ? " · " + maybe + " maybe" : "") })),
        h("span", { class: "bb-foot" }, reactions({ type: "event", id: e.id }, e.reactions, true),
          h("span", { class: "bb-comments-n" }, icon("message"), plural(e.comments.filter(c => !c.deleted).length, "comment"))));
    }

    /* ----- reactions ----- */
    function reactions(t, list, compact) {
      const counts = {}; list.forEach(r => { counts[r.emoji] = (counts[r.emoji] || 0) + 1; });
      const mine = r => list.some(x => x.emoji === r && x.fellow_id === me().id);
      const shown = compact ? EMOJI.filter(r => counts[r]) : EMOJI;
      const wrap = h("span", { class: "bb-react" });
      shown.forEach(r => add(wrap, h("button", { class: "bb-rx", type: "button", "aria-pressed": mine(r), "aria-label": r + (counts[r] ? " " + counts[r] : ""),
        onclick: ev => { ev.stopPropagation(); toggleReaction(t, r, !mine(r)); } }, r, counts[r] ? h("span", { class: "bb-rx-n", text: counts[r] }) : null)));
      if (compact) {
        if (!shown.length) add(wrap, h("button", { class: "bb-rx bb-rx-add", type: "button", "aria-label": "React", onclick: ev => { ev.stopPropagation(); toggleReaction(t, EMOJI[0], true); } }, EMOJI[0], h("span", { class: "bb-rx-n", text: "React" })));
      }
      return wrap;
    }
    function toggleReaction(t, emoji, on) {
      const x = t.type === "event" ? event(t.id) : t.type === "photo" ? photo(t.id) : findComment(t.id);
      if (x) { x.reactions = x.reactions.filter(r => !(r.fellow_id === me().id && r.emoji === emoji)); if (on) x.reactions.push({ emoji, fellow_id: me().id }); render(); }
      act(api.react(t, emoji, on));
    }
    function findComment(id) { for (const e of S.data.events) { const c = e.comments.find(x => x.id === id); if (c) return c; } for (const p of S.data.photos) { const c = p.comments.find(x => x.id === id); if (c) return c; } return null; }

    /* ----- comments ----- */
    function commentsBlock(t, list) {
      const live = list.filter(c => !c.deleted);
      const wrap = h("div", { class: "bb-section" }, h("p", { class: "bb-label", text: "Comments · " + live.length }),
        h("div", { class: "bb-comments" }, live.map(c => h("div", { class: "bb-comment" }, avatar(fellow(c.fellow_id), null, false, true),
          h("div", { class: "bb-comment-body" }, h("p", {}, nameBtn(c.fellow_id, first(c.fellow_id), "bb-namebtn-b"), " ", c.text),
            h("div", { class: "bb-comment-meta" }, h("span", { text: ago(c.created_at, S.now) }),
              h("button", { type: "button", "aria-pressed": c.reactions.some(r => r.fellow_id === me().id), text: "❤️" + (c.reactions.length ? " " + c.reactions.length : ""), onclick: () => toggleReaction({ type: "comment", id: c.id }, "❤️", !c.reactions.some(r => r.fellow_id === me().id)) }),
              c.fellow_id === me().id ? h("button", { type: "button", text: "Delete", onclick: () => { c.deleted = true; render(); act(api.deleteComment(c.id)); } }) : null))))),
        h("form", { class: "bb-comment-form", onsubmit: ev => { ev.preventDefault(); const inp = ev.target.elements.text; const text = inp.value.trim(); if (!text) return; inp.value = "";
          const tmp = { id: "tmp-" + Date.now(), fellow_id: me().id, text, created_at: S.now, reactions: [] }; list.push(tmp); render();
          act(api.comment(t, text), c => { Object.assign(tmp, c); render(); }).catch(() => { const i = list.indexOf(tmp); if (i >= 0) list.splice(i, 1); render(); }); } },
          h("input", { class: "bb-input", name: "text", placeholder: "Add a comment", autocomplete: "off", maxlength: "500" }),
          h("button", { class: "bb-btn bb-btn-dark", type: "submit", text: "Post" })));
      return wrap;
    }

    /* ----- event sheet ----- */
    function reopen() {
      const o = S.open;
      if (o.kind === "event") { const e = event(o.id); if (e) openEvent(o.id, true); else S.open = null; }
      else if (o.kind === "album") openAlbum(o.id, true);
      else if (o.kind === "photo") { if (photo(o.id)) openLightbox(o.list(), o.id, true); else closeLightbox(); }
    }
    function openEvent(id, rerender) {
      const e = event(id); if (!e) return;
      S.open = { kind: "event", id };
      const host = isHost(e), r = myRsvp(e), a = myAtt(e), conf = confirmed(e), going = e.rsvps.filter(x => x.status === "going").map(x => x.fellow_id);
      const people = going.concat(e.invites).filter(id => id !== e.host_id);
      const locUrl = safeUrl(e.location_url);
      const content = h("div", { class: "bb-sheet-body" },
        h("div", { class: "bb-intro" }, h("span", { class: "bb-when", "data-live": isLive(e), text: (e.cancelled ? "Cancelled · " : "") + fmtWhen(e, S.now) }), h("h2", { text: e.title }),
          h("div", { class: "bb-meta" }, e.location ? h("span", {}, icon("pin"), locUrl ? h("a", { href: locUrl, target: "_blank", rel: "noopener", text: e.location }) : e.location) : null,
            h("span", {}, avatar(fellow(e.host_id), "sm", false, true), "Hosted by ", nameBtn(e.host_id)))),
        e.description ? h("p", { class: "bb-desc", text: e.description }) : null,
        !e.cancelled && e.ends_at >= S.now ? h("div", { class: "bb-rsvp" },
          ["going", "maybe", "no"].map(s => h("button", { class: "bb-btn", type: "button", "aria-pressed": r === s, onclick: () => setRsvp(e, r === s ? "none" : s) }, s === "going" ? [icon("check"), "Going"] : s === "maybe" ? "Maybe" : "Can't"))) : null,
        h("div", { class: "bb-section" }, h("div", { class: "bb-section-head" }, h("p", { class: "bb-label", text: e.ends_at < S.now ? "Who was invited" : "Going with" }),
            h("button", { class: "bb-btn bb-btn-ghost bb-btn-small", type: "button", onclick: () => openAttendees(e.id) }, icon("users"), "Show attendees")),
          h("div", { class: "bb-actions" }, people.length ? avatars(people, 8, conf.map(x => x.fellow_id)) : h("span", { class: "bb-hint", text: "Nobody tagged yet." }),
            h("button", { class: "bb-btn bb-btn-small", type: "button", onclick: () => pickFellows("Tag fellows", e.invites, ids => { e.invites = ids; render(); act(api.invite(e.id, ids), patchEvent); }) }, icon("users"), "Tag fellows"))),
        reactions({ type: "event", id: e.id }, e.reactions, false),
        attendanceBlock(e, a, conf, host),
        h("div", { class: "bb-section" }, h("div", { class: "bb-section-head" }, h("p", { class: "bb-label", text: "Photos · " + eventPhotos(e.id).length }),
            eventPhotos(e.id).length ? h("button", { class: "bb-btn bb-btn-ghost bb-btn-small", type: "button", text: "Open album", onclick: () => openAlbum(e.id) }) : null),
          eventPhotos(e.id).length ? h("div", { class: "bb-strip" }, eventPhotos(e.id).slice(0, 12).map(p => photoTile(p, () => openLightbox(eventPhotos(e.id), p.id)))) : null,
          uploadButton(e.id)),
        commentsBlock({ type: "event", id: e.id }, e.comments),
        host && !e.cancelled ? h("div", { class: "bb-actions" }, h("button", { class: "bb-btn bb-btn-small", type: "button", onclick: () => openEventForm(e) }, icon("edit"), "Edit event"),
          h("button", { class: "bb-btn bb-btn-small bb-btn-danger", type: "button", onclick: () => { if (confirm("Cancel " + e.title + " for everyone?")) act(api.cancelEvent(e.id), x => { patchEvent(x); ui.toast("Event cancelled"); }); } }, icon("x"), "Cancel event")) : null);
      if (rerender && ui.isOpen() && ui.el()) { const sheet = ui.el(); const st = sheet.scrollTop; sheet.replaceChild(content, sheet.lastChild); sheet.scrollTop = st; }
      else ui.open(content, e.title, () => { if (S.open && S.open.kind === "event") S.open = null; });
    }
    function setRsvp(e, s) {
      const prev = myRsvp(e);
      e.rsvps = e.rsvps.filter(x => x.fellow_id !== me().id); if (s !== "none") e.rsvps.push({ fellow_id: me().id, status: s }); render();
      act(api.rsvp(e.id, s), x => { patchEvent(x); if (s === "going") ui.toast("You're going to " + e.title, () => setRsvp(e, prev)); });
    }
    function attendanceBlock(e, a, conf, host) {
      const items = e.attendance.filter(x => x.status !== "denied");
      const open = windowOpen(e), started = S.now >= e.starts_at - WINDOW_BEFORE, over = S.now > e.ends_at + WINDOW_AFTER;
      const vouchesFor = id => e.vouches.filter(v => v.fellow_id === id).length;
      const myConfirmed = a && a.status === "confirmed";
      const viaWord = x => ({ tap: "Tapped \"I was there\"", host: x.fellow_id === e.host_id ? "Hosted" : "Confirmed by host", qr: "Checked in by QR", code: "Entered the passcode", photo: "Tagged in a photo", vouch: "Vouched for by 2 fellows" })[x.via] || "";
      const v = verify();
      let cta = null, note = null;
      if (e.cancelled) note = null;
      else if (!started) note = h("div", { class: "bb-notice bb-notice-muted" }, icon("clock"), "\"I was there\" opens at " + fmtTime(e.starts_at - WINDOW_BEFORE) + (sameDay(e.starts_at, S.now) ? "" : " on " + fmtDay(e.starts_at)) + ".");
      else if (!v) {
        // Verification off: one tap, counted at once, any time after the event starts.
        if (a && a.status === "confirmed") note = h("div", { class: "bb-notice" }, icon("check"), "You're on the list" + (a.late ? " (added later)" : "") + ".");
        else cta = h("button", { class: "bb-btn bb-btn-primary bb-wide", type: "button", onclick: () => { e.attendance = e.attendance.filter(x => x.fellow_id !== me().id); e.attendance.push({ fellow_id: me().id, status: "confirmed", via: "tap", late: over, created_at: S.now, confirmed_at: S.now }); render(); act(api.attend(e.id), x => { patchEvent(x); ui.toast("You're on the list"); }); } }, icon("hand"), "I was there");
      }
      else if (a) {
        if (a.status === "confirmed") note = h("div", { class: "bb-notice" }, icon("check"), "You're on the list" + (a.late ? " (added later)" : "") + ".");
        else if (a.status === "claimed") note = h("div", { class: "bb-notice bb-notice-muted" }, icon("clock"), "You tapped \"I was there\". " + first(e.host_id) + " will confirm.");
        else if (a.status === "pending") note = h("div", { class: "bb-notice bb-notice-muted" }, icon("clock"), "Your late claim is pending: " + vouchesFor(me().id) + " of 2 vouches, or " + first(e.host_id) + " confirms, or tag yourself in a photo from this event.");
      }
      else if (open) cta = h("div", { class: "bb-section" }, h("button", { class: "bb-btn bb-btn-primary bb-wide", type: "button", onclick: () => { e.attendance.push({ fellow_id: me().id, status: host ? "confirmed" : "claimed", via: host ? "host" : "tap", late: false, created_at: S.now }); render(); act(api.attend(e.id), x => { patchEvent(x); ui.toast(host ? "You're on the list" : "Sent to " + first(e.host_id) + " to confirm"); }); } }, icon("hand"), "I was there"),
        host ? null : h("button", { class: "bb-btn bb-wide", type: "button", onclick: () => openPinEntry(e) }, icon("qr"), "Enter the host's passcode"));
      else if (over) cta = h("button", { class: "bb-btn bb-wide", type: "button", onclick: () => openLateClaim(e) }, icon("hand"), "I was there too");
      return h("div", { class: "bb-section" },
        h("div", { class: "bb-section-head" }, h("p", { class: "bb-label", text: "Attendance · " + conf.length + (v ? " confirmed" : " there") }),
          v && host && !e.cancelled && e.ends_at + WINDOW_AFTER >= S.now ? h("button", { class: "bb-btn bb-btn-small", type: "button", onclick: () => openCheckinQR(e) }, icon("qr"), "Show check-in code") : null),
        note, cta,
        items.length ? h("ul", { class: "bb-list" }, items.sort((x, y) => (x.status === "confirmed" ? 0 : 1) - (y.status === "confirmed" ? 0 : 1) || x.created_at - y.created_at).map(x => {
          const f = fellow(x.fellow_id), ok = x.status === "confirmed";
          let action = null;
          if (!v) action = h("span", { class: "bb-pill " + (ok ? "bb-pill-ok" : "bb-pill-pend"), text: ok ? "There" : "Waiting" });
          else if (host && !ok && x.fellow_id !== me().id) action = h("span", { class: "bb-actions" }, h("button", { class: "bb-btn bb-btn-small bb-btn-dark", type: "button", text: "Confirm", onclick: () => { x.status = "confirmed"; x.via = "host"; render(); act(api.confirmAttendance(e.id, x.fellow_id, true), patchEvent); } }),
            h("button", { class: "bb-btn bb-btn-small bb-btn-ghost", type: "button", text: "Remove", onclick: () => { x.status = "denied"; render(); act(api.confirmAttendance(e.id, x.fellow_id, false), patchEvent); } }));
          else if (x.status === "pending" && myConfirmed && x.fellow_id !== me().id) {
            const did = e.vouches.some(v => v.fellow_id === x.fellow_id && v.voucher_id === me().id);
            action = did ? h("span", { class: "bb-pill bb-pill-pend", text: "You vouched · " + vouchesFor(x.fellow_id) + "/2" }) : h("button", { class: "bb-btn bb-btn-small", type: "button", text: "Yes, they were there", onclick: () => { e.vouches.push({ fellow_id: x.fellow_id, voucher_id: me().id }); render(); act(api.vouch(e.id, x.fellow_id), patchEvent); } });
          }
          else action = h("span", { class: "bb-pill " + (ok ? "bb-pill-ok" : "bb-pill-pend"), text: ok ? "Confirmed" : x.status === "pending" ? "Pending · " + vouchesFor(x.fellow_id) + "/2" : "Waiting for host" });
          return h("li", { class: "bb-row" }, avatar(f, "md", ok, true), h("span", { class: "bb-row-text" }, nameBtn(f.id, f.name, "bb-row-name"), h("span", { class: "bb-row-sub", text: viaWord(x) + (x.late ? " · added later" : "") + (x.confirmed_at ? " · " + fmtTime(x.confirmed_at) : "") })), action);
        })) : h("p", { class: "bb-hint", text: started && !e.cancelled ? "Nobody has checked in yet." : "" }));
    }
    // Who's who: name, the Connect card line (org · city), and the way to their Connect page.
    function openFellow(id, backFn) {
      const f = fellow(id); if (!f) return;
      const back = S.open && S.open.kind !== "photo" ? S.open : null;
      const goBackFn = backFn || (back ? () => goBack(back) : null);
      const content = h("div", { class: "bb-sheet-body" },
        h("div", { class: "bb-row", style: { border: "0", padding: "0" } }, avatar(f, "lg"), h("span", { class: "bb-row-text" }, h("h2", { text: f.name + (f.id === me().id ? " (you)" : "") }), h("span", { class: "bb-row-sub", style: { whiteSpace: "normal", fontSize: "15px" }, text: f.sub || "No card details yet" }))),
        h("div", { class: "bb-actions" }, h("button", { class: "bb-btn bb-btn-primary", type: "button", onclick: () => { ui.close(); openConnect(f); } }, icon("link"), "Open in Connect"),
          goBackFn ? h("button", { class: "bb-btn", type: "button", text: "Back", onclick: goBackFn }) : null));
      ui.open(content, f.name);
    }
    function openAttendees(eventId) {
      const e = event(eventId); if (!e) return;
      const back = S.open;
      const conf = confirmed(e).map(a => a.fellow_id);
      const by = s => e.rsvps.filter(r => r.status === s).map(r => r.fellow_id);
      const groups = [[verify() ? "There (confirmed)" : "There", conf], ["Going", by("going").filter(id => conf.indexOf(id) < 0)], ["Maybe", by("maybe")], ["Invited", e.invites.filter(id => !e.rsvps.some(r => r.fellow_id === id) && conf.indexOf(id) < 0)], ["Can't make it", by("no")]].filter(g => g[1].length);
      const content = h("div", { class: "bb-sheet-body" }, h("div", { class: "bb-intro" }, h("span", { class: "bb-when", text: fmtWhen(e, S.now) }), h("h2", { text: e.title }), h("p", { text: "Hosted by " + name(e.host_id) })),
        groups.length ? groups.map(g => h("div", { class: "bb-section" }, h("p", { class: "bb-label", text: g[0] + " · " + g[1].length }),
          h("ul", { class: "bb-list" }, g[1].map(id => { const f = fellow(id); return h("li", { class: "bb-row" }, h("button", { class: "bb-row-open", type: "button", onclick: () => openFellow(id, () => openAttendees(eventId)) }, avatar(f, "md", conf.indexOf(id) >= 0), h("span", { class: "bb-row-text" }, h("span", { class: "bb-row-name", text: f.name + (id === e.host_id ? " · host" : "") }), f.sub ? h("span", { class: "bb-row-sub", text: f.sub }) : null))); })))) :
          h("div", { class: "bb-empty" }, h("strong", { text: "Nobody yet" }), "RSVPs and check-ins show up here."),
        h("div", { class: "bb-form-actions" }, h("button", { class: "bb-btn", type: "button", text: "Back", onclick: () => goBack(back) })));
      ui.open(content, "Attendees");
    }
    function openLateClaim(e) {
      const tagged = eventPhotos(e.id).filter(p => p.tags.indexOf(me().id) >= 0);
      const daysAgo = Math.round((S.now - e.ends_at) / D);
      const content = h("div", { class: "bb-sheet-body" },
        h("div", { class: "bb-intro" }, h("span", { class: "bb-when", text: fmtDay(e.starts_at) + " · " + e.title }), h("h2", { text: "I was there too" }),
          h("p", { text: "This event ended " + (daysAgo < 1 ? "earlier" : plural(daysAgo, "day") + " ago") + ", so your claim needs one proof. It shows as pending until it's verified." })),
        h("ul", { class: "bb-list" },
          h("li", { class: "bb-row" }, h("span", { class: "bb-av bb-av-md", style: { background: "var(--bb-accent-soft)", color: "var(--bb-accent-ink)" } }, icon("photo")), h("span", { class: "bb-row-text" }, h("span", { class: "bb-row-name", text: "Tag yourself in a photo from this event" }), h("span", { class: "bb-row-sub", text: tagged.length ? "You're already tagged in " + tagged.length + " · verifies instantly" : eventPhotos(e.id).length ? "Open the album and tag yourself, or upload one" : "Upload a photo from the event and tag yourself" })),
            tagged.length ? h("span", { class: "bb-pill bb-pill-ok", text: "Ready" }) : h("button", { class: "bb-btn bb-btn-small", type: "button", text: eventPhotos(e.id).length ? "Open album" : "Upload", onclick: () => { eventPhotos(e.id).length ? openAlbum(e.id) : uploadFlow(e.id); } })),
          h("li", { class: "bb-row" }, h("span", { class: "bb-av bb-av-md" }, icon("qr")), h("span", { class: "bb-row-text" }, h("span", { class: "bb-row-name", text: "Enter the host's passcode" }), h("span", { class: "bb-row-sub", text: "The 6-digit code from " + first(e.host_id) + "'s screen · verifies instantly" })), h("button", { class: "bb-btn bb-btn-small", type: "button", text: "Enter code", onclick: () => openPinEntry(e) })),
          h("li", { class: "bb-row" }, h("span", { class: "bb-av bb-av-md" }, icon("user")), h("span", { class: "bb-row-text" }, h("span", { class: "bb-row-name", text: "Ask the host" }), h("span", { class: "bb-row-sub", text: first(e.host_id) + " confirms from the event" })), h("span", { class: "bb-pill bb-pill-pend", text: "Pending" })),
          h("li", { class: "bb-row" }, h("span", { class: "bb-av bb-av-md" }, icon("users")), h("span", { class: "bb-row-text" }, h("span", { class: "bb-row-name", text: "Two attendees vouch" }), h("span", { class: "bb-row-sub", text: "Any two confirmed fellows tap \"Yes, they were there\"" })), h("span", { class: "bb-pill bb-pill-pend", text: "0 of 2" }))),
        h("button", { class: "bb-btn bb-btn-primary bb-wide", type: "button", text: tagged.length ? "Add me as attended" : "Send my claim", onclick: () => {
          e.attendance.push({ fellow_id: me().id, status: tagged.length ? "confirmed" : "pending", via: tagged.length ? "photo" : "tap", late: true, created_at: S.now });
          act(api.attendLate(e.id, { photoId: tagged[0] && tagged[0].id }), x => { patchEvent(x); ui.toast(tagged.length ? "You're on the list" : "Claim sent. It's pending until verified."); openEvent(e.id); });
        } }));
      ui.open(content, "I was there too");
    }
    function openCheckinQR(e) {
      const box = h("div", { class: "bb-qr" }, h("p", { class: "bb-hint", text: "Making the code…" }));
      const pinEl = h("div", { class: "bb-pin", "aria-live": "polite" }, "······");
      const content = h("div", { class: "bb-sheet-body" },
        h("div", { class: "bb-intro" }, h("span", { class: "bb-when", text: fmtWhen(e, S.now) }), h("h2", { text: "Check in to " + e.title }), h("p", { text: "Fellows scan the code with their camera, or type the 6-digit passcode under \"I was there\". Either marks them as there, no host confirm needed." })),
        box, h("p", { class: "bb-qr-label", text: "Scan to check in" }),
        h("p", { class: "bb-qr-label", text: "Or read out the passcode" }), pinEl,
        h("div", { class: "bb-actions", style: { justifyContent: "center" } }, h("button", { class: "bb-btn bb-btn-small", type: "button", text: "Get a new code", onclick: () => draw(api.newCheckinCode(e.id)) })));
      const draw = p => p.then(r => { const url = qrBase + "#bb-checkin-" + r.code; box.textContent = ""; if (root.PulseQR) box.innerHTML = root.PulseQR.svg(url, { color: "#0b0b0b" }); else add(box, h("a", { href: url, text: url })); pinEl.textContent = r.pin ? String(r.pin).replace(/(\d{3})(\d{3})/, "$1 $2") : "Tap \"Get a new code\""; }, err => { box.textContent = ""; add(box, h("p", { class: "bb-error", text: why(err) })); });
      draw(api.checkinCode ? api.checkinCode(e.id) : api.newCheckinCode(e.id));
      ui.open(content, "Check-in code");
    }
    function openPinEntry(e) {
      const inp = h("input", { class: "bb-input bb-pin-input", inputmode: "numeric", pattern: "[0-9]*", maxlength: "7", autocomplete: "one-time-code", placeholder: "000 000", "aria-label": "6-digit passcode" });
      const err = h("p", { class: "bb-error", hidden: true });
      const submit = () => { const pin = inp.value.replace(/\D/g, ""); if (pin.length !== 6) { err.textContent = "Enter all 6 digits."; err.hidden = false; return; } err.hidden = true;
        act(api.checkin(e.id + "-" + pin), x => { patchEvent(x); ui.toast("Checked in to " + e.title); openEvent(e.id); }).catch(() => { err.textContent = MSG.bad_code.replace("code", "passcode"); err.hidden = false; }); };
      const content = h("div", { class: "bb-sheet-body" }, h("div", { class: "bb-intro" }, h("span", { class: "bb-when", text: fmtWhen(e, S.now) }), h("h2", { text: "Enter the host's passcode" }), h("p", { text: first(e.host_id) + " has a 6-digit code on their screen. Type it to mark yourself as there." })),
        h("form", { class: "bb-form", onsubmit: ev => { ev.preventDefault(); submit(); } }, h("label", { class: "bb-field" }, h("span", { text: "Passcode" }), inp), err,
          h("div", { class: "bb-form-actions" }, h("button", { class: "bb-btn", type: "button", text: "Back", onclick: () => openEvent(e.id) }), h("button", { class: "bb-btn bb-btn-primary", type: "submit", text: "Check in" }))));
      ui.open(content, "Enter passcode"); setTimeout(() => inp.focus(), 50);
    }
    function openCheckinLink(code) {
      if (!S.data) { timers.pendingCode = code; return; }
      act(api.checkin(code), e => { patchEvent(e); ui.toast("Checked in to " + e.title); openEvent(e.id); });
    }

    /* ----- event form ----- */
    function openEventForm(e) {
      const start = e ? e.starts_at : (() => { const d = new Date(S.now + D); d.setHours(19, 0, 0, 0); return d.getTime(); })();
      const end = e ? e.ends_at : start + 2 * H;
      let invites = e ? e.invites.slice() : [];
      const err = h("p", { class: "bb-error", hidden: true });
      const who = h("div", { class: "bb-actions" });
      const drawWho = () => { who.textContent = ""; add(who, [invites.length ? avatars(invites, 8) : h("span", { class: "bb-hint", text: "Nobody yet" }), h("button", { class: "bb-btn bb-btn-small", type: "button", onclick: () => pickFellows("Who's this with?", invites, ids => { invites = ids; drawWho(); }) }, icon("users"), invites.length ? "Change" : "Tag fellows")]); };
      drawWho();
      const form = h("form", { class: "bb-form", novalidate: true, onsubmit: ev => {
        ev.preventDefault(); const f = ev.target.elements; err.hidden = true;
        const s = new Date(f.starts.value).getTime(), en = new Date(f.ends.value).getTime();
        if (!f.title.value.trim() || isNaN(s)) { err.textContent = MSG.bad_text; err.hidden = false; return; }
        if (isNaN(en) || en <= s) { err.textContent = "The end has to be after the start."; err.hidden = false; return; }
        const body = { title: f.title.value.trim(), description: f.description.value.trim(), starts_at: s, ends_at: en, location: f.location.value.trim(), location_url: f.location_url.value.trim(), invites };
        const btn = form.querySelector("[type=submit]"); btn.disabled = true;
        act(e ? api.updateEvent(e.id, body) : api.createEvent(body), x => { patchEvent(x); ui.toast(e ? "Event updated" : "Proposed: " + x.title); openEvent(x.id); }).catch(() => { btn.disabled = false; });
      } },
        h("label", { class: "bb-field" }, h("span", { text: "What" }), h("input", { class: "bb-input", name: "title", value: e ? e.title : "", placeholder: "Karaoke at Pandora", maxlength: "80", required: true })),
        h("div", { class: "bb-field-row" },
          h("label", { class: "bb-field" }, h("span", { text: "Starts" }), h("input", { class: "bb-input", name: "starts", type: "datetime-local", value: toLocalInput(start), required: true, onchange: ev => { const s = new Date(ev.target.value).getTime(); if (!isNaN(s)) form.elements.ends.value = toLocalInput(s + 2 * H); } })),
          h("label", { class: "bb-field" }, h("span", { text: "Ends" }), h("input", { class: "bb-input", name: "ends", type: "datetime-local", value: toLocalInput(end), required: true }))),
        h("label", { class: "bb-field" }, h("span", { text: "Where" }), h("input", { class: "bb-input", name: "location", value: e ? e.location : "", placeholder: "Pandora Karaoke, 50 Mason St", maxlength: "120" })),
        h("label", { class: "bb-field" }, h("span", { text: "Map link (optional)" }), h("input", { class: "bb-input", name: "location_url", type: "url", value: e ? e.location_url || "" : "", placeholder: "https://maps.apple.com/…" })),
        h("label", { class: "bb-field" }, h("span", { text: "Details" }), h("textarea", { class: "bb-input", name: "description", placeholder: "Private room booked for 15. Bring your worst song.", maxlength: "1000" }, e ? e.description : "")),
        h("div", { class: "bb-field" }, h("span", { text: "With" }), who),
        err,
        h("div", { class: "bb-form-actions" }, h("button", { class: "bb-btn", type: "button", text: "Cancel", onclick: () => e ? openEvent(e.id) : ui.close() }), h("button", { class: "bb-btn bb-btn-primary", type: "submit", text: e ? "Save" : "Propose it" })));
      ui.open(h("div", { class: "bb-sheet-body" }, h("h2", { text: e ? "Edit event" : "Propose an event" }), form), e ? "Edit event" : "Propose an event", () => { if (!e && S.open && S.open.kind === "event") S.open = null; });
      setTimeout(() => form.elements.title.focus(), 50);
    }
    // Roster picker, used for invites and photo tags. Keeps the sheet underneath by stacking a new one.
    function pickFellows(title, selected, done) {
      let sel = selected.slice();
      const list = h("ul", { class: "bb-list bb-picker-list" });
      const draw = q => {
        list.textContent = "";
        S.data.fellows.filter(f => !q || f.name.toLowerCase().includes(q) || (f.sub || "").toLowerCase().includes(q)).forEach(f => {
          const on = sel.indexOf(f.id) >= 0;
          add(list, h("li", { class: "bb-row" }, h("button", { class: "bb-row-open", type: "button", onclick: () => { sel = on ? sel.filter(x => x !== f.id) : sel.concat(f.id); draw(q); } }, avatar(f, "md"), h("span", { class: "bb-row-text" }, h("span", { class: "bb-row-name", text: f.name + (f.id === me().id ? " (you)" : "") }), f.sub ? h("span", { class: "bb-row-sub", text: f.sub }) : null)),
            h("button", { class: "bb-tick", type: "button", "aria-pressed": on, "aria-label": (on ? "Remove " : "Add ") + f.name, onclick: () => { sel = on ? sel.filter(x => x !== f.id) : sel.concat(f.id); draw(q); } }, icon("check"))));
        });
      };
      draw("");
      const back = S.open; // the event or album sheet underneath; ui.open() clears S.open through that sheet's closing hook
      const content = h("div", { class: "bb-sheet-body" }, h("h2", { text: title }),
        h("div", { class: "bb-search-wrap" }, icon("search"), h("input", { class: "bb-search", type: "search", placeholder: "Search name or org", oninput: ev => draw(ev.target.value.trim().toLowerCase()) })),
        list,
        h("div", { class: "bb-form-actions" }, h("button", { class: "bb-btn bb-btn-primary", type: "button", text: "Done", onclick: () => { done(sel); goBack(back); } })));
      ui.open(content, title);
    }
    // Return to the sheet a picker or form was opened from (or close if there was none). Lightbox stays as it is.
    function goBack(back) { if (back && back.kind !== "photo") { S.open = back; reopen(); } else if (lb) ui.close(); else ui.close(); }

    /* ----- photos section ----- */
    function renderPhotos() {
      const c = nodes.photos; if (!c) return; c.textContent = "";
      const all = okPhotos().sort((a, b) => taken(b) - taken(a));
      const tagged = all.filter(p => p.tags.indexOf(me().id) >= 0);
      const albums = S.data.events.filter(e => eventPhotos(e.id).length).sort((a, b) => b.starts_at - a.starts_at);
      add(c, [
        h("div", { class: "bb-section-head" }, h("p", { class: "bb-label", text: "Photos" }), uploadButton(null, true)),
        h("div", { class: "bb-tabs", role: "tablist" },
          tab("Cohort", all.length, S.ptab === "cohort", () => { S.ptab = "cohort"; renderPhotos(); }),
          tab("By event", albums.length, S.ptab === "event", () => { S.ptab = "event"; renderPhotos(); }),
          tab("Tagged", tagged.length, S.ptab === "tagged", () => { S.ptab = "tagged"; renderPhotos(); }))
      ]);
      if (S.ptab === "event") {
        add(c, albums.length ? h("div", { class: "bb-albums" }, albums.map(e => { const ps = eventPhotos(e.id).sort((a, b) => taken(b) - taken(a));
          return h("button", { class: "bb-album", type: "button", onclick: () => openAlbum(e.id) }, h("span", { class: "bb-album-cover", "data-n": Math.min(ps.length, 3) }, ps.slice(0, 3).map(p => h("img", { src: thumbUrl(p), alt: "", loading: "lazy" }))), h("b", { text: e.title }), h("small", { text: plural(ps.length, "photo") + " · " + fmtDay(e.starts_at) })); })) :
          h("div", { class: "bb-empty" }, h("strong", { text: "No event albums yet" }), "Add photos from an event and they'll show up here."));
        return;
      }
      const list = S.ptab === "tagged" ? tagged : all;
      add(c, [downloadRow(S.ptab === "tagged" ? { tagged: true } : {}, list),
        list.length ? h("div", { class: "bb-grid" }, list.map(p => photoTile(p, () => openLightbox(list, p.id)))) :
          h("div", { class: "bb-empty" }, h("strong", { text: S.ptab === "tagged" ? "You're not tagged yet" : "No photos yet" }), S.ptab === "tagged" ? "When a fellow tags you in a photo, it lands here." : "Add the first one from your camera roll.")]);
    }
    function photoTile(p, click) {
      return h("button", { class: "bb-ph", type: "button", "data-pending": p.status === "pending", onclick: click, "aria-label": "Photo by " + name(p.uploader_id) },
        h("img", { src: thumbUrl(p), alt: p.caption || "", loading: "lazy" }),
        p.source !== "app" ? h("span", { class: "bb-ph-badge" }, icon(p.source === "slack" ? "slack" : p.source === "email" ? "send" : "phone"), p.source === "slack" ? "Slack" : p.source === "email" ? "Email" : "Text · reduced") : p.reactions.length ? h("span", { class: "bb-ph-badge", text: "🔥 " + p.reactions.length }) : null,
        p.tags.length ? avatars(p.tags, 3) : null);
    }
    function openAlbum(eventId, rerender) {
      const e = event(eventId); if (!e) return;
      S.open = { kind: "album", id: eventId };
      let list = eventPhotos(eventId).sort((a, b) => taken(b) - taken(a));
      const taggedN = list.filter(p => p.tags.indexOf(me().id) >= 0).length;
      if (S.taggedOnly) list = list.filter(p => p.tags.indexOf(me().id) >= 0);
      const content = h("div", { class: "bb-sheet-body" },
        h("div", { class: "bb-intro" }, h("span", { class: "bb-when", text: fmtDay(e.starts_at) + " · " + e.location }), h("h2", { text: e.title }), h("p", { text: plural(eventPhotos(eventId).length, "photo") + " · " + plural(confirmed(e).length, "fellow") + " there" })),
        h("div", { class: "bb-chips" }, h("button", { class: "bb-chip", type: "button", "aria-pressed": !S.taggedOnly, text: "All", onclick: () => { S.taggedOnly = false; openAlbum(eventId, true); } }),
          h("button", { class: "bb-chip", type: "button", "aria-pressed": S.taggedOnly, onclick: () => { S.taggedOnly = true; openAlbum(eventId, true); } }, "Tagged me", h("span", { class: "bb-tab-count", text: taggedN })),
          h("button", { class: "bb-chip", type: "button", onclick: () => openEvent(eventId) }, "Event details")),
        downloadRow({ eventId }, list),
        list.length ? h("div", { class: "bb-grid" }, list.map(p => photoTile(p, () => openLightbox(list, p.id)))) : h("div", { class: "bb-empty" }, h("strong", { text: S.taggedOnly ? "You're not tagged in this album" : "No photos yet" })),
        uploadButton(eventId));
      if (rerender && ui.isOpen() && ui.el()) { const sheet = ui.el(); const st = sheet.scrollTop; sheet.replaceChild(content, sheet.lastChild); sheet.scrollTop = st; }
      else ui.open(content, e.title + " album", () => { if (S.open && S.open.kind === "album") S.open = null; S.taggedOnly = false; });
    }

    /* ----- downloads (originals, zipped on the phone) ----- */
    const dlKey = scope => "bb.dl." + (scope.eventId ? "event." + scope.eventId : scope.tagged ? "tagged" : "cohort") + "." + me().id;
    function downloadRow(scope, list) {
      if (!list.length) return null;
      const seen = ls.get(dlKey(scope)) || { ids: [], at: 0 };
      const remaining = list.filter(p => seen.ids.indexOf(p.id) < 0);
      const total = list.reduce((s, p) => s + (p.bytes || 0), 0);
      const verb = canShareFiles ? "Save to Photos" : "Download";
      const row = h("div", { class: "bb-actions" },
        h("button", { class: "bb-btn bb-btn-small", type: "button", onclick: () => downloadAll(scope, list, row) }, icon("download"), verb + " · all " + list.length + (total && !canShareFiles ? " · " + fmtBytes(total) : "")),
        seen.at ? h("button", { class: "bb-btn bb-btn-small", type: "button", disabled: !remaining.length, onclick: () => downloadAll(scope, remaining, row) }, icon("download"), remaining.length ? verb + " · " + remaining.length + " new" : "Nothing new since " + ago(seen.at, S.now)) : null);
      return row;
    }
    function markDownloaded(scope, files) {
      const seen = ls.get(dlKey(scope)) || { ids: [], at: 0 };
      ls.set(dlKey(scope), { ids: seen.ids.concat(files.map(f => f.id)).filter((x, i, a) => a.indexOf(x) === i), at: Date.now() });
    }
    // Fetch the originals, then either zip them (laptops) or hand them to the share sheet (phones), where
    // "Save Images" drops them into the Photos library. The share must start from a tap, so the fetch
    // happens first and a "Save" button appears once the files are ready.
    function downloadAll(scope, list, row) {
      if (!list.length) return;
      if (list.length > 40 && !canShareFiles && !confirm("That's " + plural(list.length, "photo") + " at full quality. Zip them now?")) return;
      const prog = h("div", { class: "bb-progress" }, h("span", { text: "Fetching originals…" }), h("div", { class: "bb-bar" }, h("i")));
      row.after(prog); const bar = prog.querySelector("i"), txt = prog.firstChild;
      const e = scope.eventId && event(scope.eventId);
      const base = "basecamp-" + (e ? slugify(e.title) : scope.tagged ? "tagged" : "cohort");
      Promise.all([canShareFiles ? null : loadZip(), api.downloadAlbum(scope)]).then(([JSZip, files]) => {
        const want = new Set(list.map(p => p.id)); files = files.filter(f => want.has(f.id));
        const blobs = []; const names = {};
        const next = i => { if (i >= files.length) return Promise.resolve();
          const f = files[i]; return fetch(f.url).then(r => r.blob()).then(b => stampJpeg(b, photo(f.id) || {})).then(b => { let nm = f.filename || f.id + ".jpg"; if (names[nm]) nm = nm.replace(/(\.[^.]+)?$/, "-" + (++names[nm]) + "$1"); else names[nm] = 1; blobs.push({ id: f.id, name: nm, blob: b }); bar.style.width = Math.round(blobs.length / files.length * 90) + "%"; txt.textContent = "Fetched " + blobs.length + " of " + files.length; }).then(() => next(i + 1)); };
        return next(0).then(() => {
          if (canShareFiles) {
            // Batches keep the share sheet responsive with big albums.
            const batches = []; for (let i = 0; i < blobs.length; i += SHARE_BATCH) batches.push(blobs.slice(i, i + SHARE_BATCH));
            let at = 0; bar.style.width = "100%";
            const btn = h("button", { class: "bb-btn bb-btn-primary", type: "button" });
            const draw = () => { btn.textContent = ""; add(btn, [icon("download"), batches.length > 1 ? "Save photos " + (at * SHARE_BATCH + 1) + "–" + (at * SHARE_BATCH + batches[at].length) + " of " + blobs.length : "Save " + plural(blobs.length, "photo") + " to Photos"]); txt.textContent = "Ready. Tap Save, then choose \"Save Image\" in the sheet."; };
            btn.onclick = () => {
              const files2 = batches[at].map(b => new File([b.blob], b.name, { type: b.blob.type || "image/jpeg" }));
              navigator.share({ files: files2, title: e ? e.title : "Basecamp photos" }).then(() => { markDownloaded(scope, batches[at]); at++; if (at < batches.length) draw(); else { ui.toast("Saved " + plural(blobs.length, "photo") + " at full quality"); prog.remove(); render(); } },
                err => { if (err && err.name === "AbortError") return; ui.toast("Couldn't open the share sheet. Try fewer at once."); });
            };
            draw(); prog.appendChild(btn);
            return;
          }
          txt.textContent = "Zipping…";
          const zip = new JSZip(); blobs.forEach(b => zip.file(b.name, b.blob));
          return zip.generateAsync({ type: "blob" }).then(blob => {
            bar.style.width = "100%";
            saveBlob(blob, base + "-" + new Date().toISOString().slice(0, 10) + ".zip");
            markDownloaded(scope, blobs);
            ui.toast("Saved " + plural(blobs.length, "photo") + " at full quality"); prog.remove(); render();
          });
        });
      }).catch(e => { prog.remove(); ui.toast(why(e)); });
    }
    function downloadOne(p, btn) {
      const url = api.photoUrl(p.id, { size: "orig" });
      const nm = p.filename || p.id + ".jpg";
      if (canShareFiles) {
        btn.disabled = true; btn.textContent = "Fetching…";
        fetch(url).then(r => r.blob()).then(b => stampJpeg(b, p)).then(b => {
          btn.disabled = false; btn.textContent = ""; add(btn, [icon("download"), "Save to Photos"]);
          btn.onclick = () => navigator.share({ files: [new File([b], nm, { type: b.type || "image/jpeg" })] }).catch(() => {});
          ui.toast("Ready. Tap \"Save to Photos\" again, then \"Save Image\".");
        }).catch(() => { btn.disabled = false; btn.textContent = "Original"; ui.toast(MSG.unreachable); });
        return;
      }
      fetch(url).then(r => r.blob()).then(b => stampJpeg(b, p)).then(b => saveBlob(b, nm)).catch(() => { const a = document.createElement("a"); a.href = url; a.download = nm; a.target = "_blank"; a.click(); });
    }

    /* ----- upload ----- */
    function uploadButton(eventId, small) {
      return h("label", { class: "bb-btn bb-file" + (small ? " bb-btn-small" : "") }, icon("camera"), eventId ? "Add photos" : "Add photos",
        h("input", { type: "file", accept: "image/*", multiple: true, "aria-label": "Add photos", onchange: ev => { const files = Array.from(ev.target.files || []); ev.target.value = ""; if (files.length) uploadFlow(eventId, files); } }));
    }
    function uploadFlow(eventId, files) {
      if (!files) { const inp = h("input", { type: "file", accept: "image/*", multiple: true }); inp.onchange = () => { const f = Array.from(inp.files || []); if (f.length) uploadFlow(eventId, f); }; inp.click(); return; }
      let target = eventId || "", tags = [], caption = "";
      const back = S.open;
      const candidates = S.data.events.filter(e => !e.cancelled && Math.abs(S.now - e.starts_at) < 14 * D).sort((a, b) => b.starts_at - a.starts_at);
      const who = h("div", { class: "bb-actions" });
      const drawWho = () => { who.textContent = ""; add(who, [tags.length ? avatars(tags, 8) : h("span", { class: "bb-hint", text: "Nobody tagged" }), h("button", { class: "bb-btn bb-btn-small", type: "button", onclick: () => pickFellows("Who's in these?", tags, ids => { tags = ids; drawWho(); }) }, icon("tag"), "Tag people")]); };
      drawWho();
      const prog = h("div", { class: "bb-progress", hidden: true }, h("span"), h("div", { class: "bb-bar" }, h("i")));
      const content = h("div", { class: "bb-sheet-body" }, h("h2", { text: "Add " + plural(files.length, "photo") }),
        h("p", { class: "bb-hint", text: "Originals are kept at full quality (" + fmtBytes(files.reduce((s, f) => s + f.size, 0)) + "). Fellows can download them later." }),
        h("div", { class: "bb-strip" }, files.slice(0, 8).map(f => { const u = URL.createObjectURL(f); return h("span", { class: "bb-ph", style: { width: "72px" } }, h("img", { src: u, alt: "", onload: () => URL.revokeObjectURL(u) })); })),
        h("label", { class: "bb-field" }, h("span", { text: "Album" }), h("select", { class: "bb-input", onchange: ev => { target = ev.target.value; } },
          h("option", { value: "", selected: !target, text: "Cohort album (everyone)" }), candidates.map(e => h("option", { value: e.id, selected: e.id === target, text: e.title + " · " + fmtDay(e.starts_at) })))),
        h("label", { class: "bb-field" }, h("span", { text: "Caption (optional)" }), h("input", { class: "bb-input", maxlength: "200", placeholder: "Say something about these", oninput: ev => { caption = ev.target.value; } })),
        h("div", { class: "bb-field" }, h("span", { text: "Who's in them" }), who),
        prog,
        h("div", { class: "bb-form-actions" }, h("button", { class: "bb-btn", type: "button", text: "Cancel", onclick: () => goBack(back) }),
          h("button", { class: "bb-btn bb-btn-primary", type: "button", text: "Upload", onclick: async ev => {
            const btn = ev.currentTarget; btn.disabled = true; prog.hidden = false; const bar = prog.querySelector("i"), txt = prog.firstChild; let done = 0, failed = 0;
            for (const f of files) {
              txt.textContent = "Uploading " + (done + failed + 1) + " of " + files.length + " · " + f.name;
              try { const [t, meta] = await Promise.all([makeThumb(f), readExifMeta(f)]); const p = await api.uploadPhoto(f, { eventId: target || null, caption, tags, thumb: t.thumb, width: t.width, height: t.height, taken_at: meta.taken_at, lat: meta.lat, lng: meta.lng }); done++; patchPhoto(p); }
              catch (e) { failed++; ui.toast(f.name + ": " + why(e)); }
              bar.style.width = Math.round((done + failed) / files.length * 100) + "%";
            }
            ui.toast(done ? "Added " + plural(done, "photo") + (target ? " to " + event(target).title : " to the cohort album") : "Nothing uploaded");
            if (target) { S.taggedOnly = false; openAlbum(target); } else { S.ptab = "cohort"; ui.close(); render(); }
          } })));
      ui.open(content, "Add photos");
    }

    /* ----- inbound review ----- */
    function openInboundReview() {
      const list = pendingMine();
      const candidates = S.data.events.filter(e => !e.cancelled && Math.abs(S.now - e.starts_at) < 14 * D).sort((a, b) => b.starts_at - a.starts_at);
      const content = h("div", { class: "bb-sheet-body" }, h("h2", { text: plural(list.length, "photo") + " to review" }), h("p", { class: "bb-hint", text: "These came in from Slack or text. Pick where each one goes, or post them all where they were sent. Anything left here is posted after 24 hours." }),
        list.length ? h("div", { class: "bb-actions" }, h("button", { class: "bb-btn bb-btn-dark", type: "button", onclick: postAllInbound }, icon("check"), "Post all " + list.length), h("span", { class: "bb-hint", text: "Turn on \"Post mine automatically\" under Photos to skip this list." })) : null,
        list.length ? h("ul", { class: "bb-list" }, list.map(p => { let target = p.event_id || "";
          return h("li", { class: "bb-row", style: { alignItems: "flex-start", flexWrap: "wrap" } }, h("span", { class: "bb-ph", style: { width: "72px" } }, h("img", { src: thumbUrl(p), alt: "" })),
            h("span", { class: "bb-row-text", style: { gap: "6px" } }, h("span", { class: "bb-row-sub", text: "From " + (p.source === "slack" ? "Slack" : p.source === "email" ? "email" : "text") + " · " + ago(p.created_at, S.now) + (p.caption ? " · “" + p.caption + "”" : "") }),
              h("select", { class: "bb-input", style: { minHeight: "40px" }, onchange: ev => { target = ev.target.value; } }, h("option", { value: "", selected: !target, text: "Cohort album" }), candidates.map(e => h("option", { value: e.id, selected: e.id === target, text: e.title }))),
              h("span", { class: "bb-actions" }, h("button", { class: "bb-btn bb-btn-small bb-btn-dark", type: "button", text: "Keep", onclick: () => { p.status = "ok"; p.event_id = target || null; render(); act(api.confirmInbound(p.id, { eventId: target || null }), patchPhoto); if (pendingMine().length) openInboundReview(); else ui.close(); } }),
                h("button", { class: "bb-btn bb-btn-small bb-btn-ghost", type: "button", text: "Discard", onclick: () => { S.data.photos = S.data.photos.filter(x => x.id !== p.id); render(); act(api.discardInbound(p.id)); if (pendingMine().length) openInboundReview(); else ui.close(); } })))); })) :
          h("div", { class: "bb-empty" }, h("strong", { text: "All caught up" })));
      ui.open(content, "Review photos");
    }

    /* ----- lightbox ----- */
    let lb = null, lbKeys = null;
    function closeLightbox() { if (lb) { lb.remove(); lb = null; document.body.classList.remove("bb-lock"); } if (lbKeys) { document.removeEventListener("keydown", lbKeys); lbKeys = null; } if (S.open && S.open.kind === "photo") S.open = S.open.back || null; if (S.open) reopen(); }
    function openLightbox(list, id, rerender) {
      const ids = list.map(p => p.id); let idx = ids.indexOf(id); if (idx < 0) idx = 0;
      const back = S.open && S.open.kind !== "photo" ? S.open : (S.open && S.open.back) || null;
      S.open = { kind: "photo", id: ids[idx], list: () => ids.map(photo).filter(Boolean), back };
      const p = photo(ids[idx]); if (!p) return closeLightbox();
      const e = p.event_id && event(p.event_id);
      const mineTag = p.tags.indexOf(me().id) >= 0;
      const canDelete = p.uploader_id === me().id || (e && isHost(e));
      const go = d => { const n = (idx + d + ids.length) % ids.length; openLightbox(list, ids[n], true); };
      const panel = h("div", { class: "bb-lb-panel" },
        h("div", { class: "bb-lb-head" }, avatar(fellow(p.uploader_id), "md", false, true), h("span", { class: "bb-row-text" }, nameBtn(p.uploader_id, name(p.uploader_id), "bb-row-name"), h("span", { class: "bb-row-sub", text: (p.taken_at ? "Taken " + fmtDay(p.taken_at) + " " + fmtTime(p.taken_at) : "Added " + ago(p.created_at, S.now)) + (e ? " · " + e.title : " · Cohort album") + (p.source !== "app" ? " · via " + (p.source === "slack" ? "Slack" : p.source === "email" ? "email" : "text") : "") }),
          h("span", { class: "bb-row-sub bb-lb-geo" }, p.lat != null && p.lng != null ? h("a", { href: mapUrl(p.lat, p.lng), target: "_blank", rel: "noopener", title: p.lat + ", " + p.lng }, icon("pin"), "Where it was taken") : h("span", { text: "No location in this file" }),
            " · ", h("span", { text: p.source === "sms" ? "Reduced by MMS" + (p.bytes ? " · " + fmtBytes(p.bytes) : "") : "Original file" + (p.bytes ? " · " + fmtBytes(p.bytes) : "") + (p.width && p.height ? " · " + p.width + "×" + p.height : "") }))),
          h("button", { class: "bb-btn bb-btn-small", type: "button", title: "The original file (" + (p.bytes ? fmtBytes(p.bytes) : "full quality") + ")", onclick: ev => downloadOne(p, ev.currentTarget) }, icon("download"), canShareFiles ? "Save to Photos" : "Original")),
        h("div", { class: "bb-actions" }, p.caption ? h("p", { class: "bb-desc", text: p.caption }) : h("span", { class: "bb-hint", text: canDelete ? "No caption yet" : "" }),
          canDelete ? h("button", { class: "bb-btn bb-btn-small bb-btn-ghost", type: "button", onclick: () => editCaption(p) }, icon("edit"), p.caption ? "Edit caption" : "Add caption") : null),
        h("div", { class: "bb-tags" }, p.tags.map(id => h("button", { class: "bb-tag", type: "button", "data-me": id === me().id, title: name(id), onclick: () => openFellow(id) }, avatar(fellow(id), "sm"), id === me().id ? "You" : first(id))),
          h("button", { class: "bb-btn bb-btn-small bb-btn-ghost", type: "button", onclick: () => pickFellows("Who's in this photo?", p.tags, ids2 => { p.tags = ids2; act(api.updatePhoto(p.id, { tags: ids2 }), patchPhoto); }) }, icon("tag"), "Tag people"),
          mineTag ? h("button", { class: "bb-btn bb-btn-small bb-btn-ghost", type: "button", text: "Untag me", onclick: () => { p.tags = p.tags.filter(x => x !== me().id); act(api.untagMe(p.id), patchPhoto); } }) : null),
        reactions({ type: "photo", id: p.id }, p.reactions, false),
        h("div", { class: "bb-actions" },
          h("button", { class: "bb-btn bb-btn-small", type: "button", onclick: () => moveToEvent(p) }, icon("link"), e ? "Move to another album" : "Add to an event"),
          p.source !== "app" && p.uploader_id === me().id && api.replacePhoto ? h("label", { class: "bb-btn bb-btn-small bb-file", title: "Texted and emailed photos arrive compressed. Pick the same photo from your camera roll to swap in the full-quality file; tags and comments stay." }, icon("upload"), "Replace with the original",
            h("input", { type: "file", accept: "image/*", "aria-label": "Replace with the original", onchange: ev => { const f = ev.target.files && ev.target.files[0]; ev.target.value = ""; if (f) replaceOriginal(p, f); } })) : null,
          canDelete ? h("button", { class: "bb-btn bb-btn-small bb-btn-danger", type: "button", onclick: () => { if (!confirm("Delete this photo for everyone?")) return; S.data.photos = S.data.photos.filter(x => x.id !== p.id); act(api.deletePhoto(p.id)); ui.toast("Photo deleted"); if (ids.length > 1) { const rest = list.filter(x => x.id !== p.id); openLightbox(rest, rest[Math.min(idx, rest.length - 1)].id, true); } else closeLightbox(); } }, icon("trash"), "Delete") : null),
        commentsBlock({ type: "photo", id: p.id }, p.comments));
      const img = h("img", { src: fullUrl(p), alt: p.caption || "Photo by " + name(p.uploader_id) });
      const stage = h("div", { class: "bb-lb-stage" }, img,
        ids.length > 1 ? h("button", { class: "bb-lb-nav bb-lb-prev", type: "button", "aria-label": "Previous", onclick: () => go(-1) }, icon("left")) : null,
        ids.length > 1 ? h("button", { class: "bb-lb-nav bb-lb-next", type: "button", "aria-label": "Next", onclick: () => go(1) }, icon("right")) : null);
      let x0 = null; stage.addEventListener("touchstart", ev => { x0 = ev.touches[0].clientX; }, { passive: true }); stage.addEventListener("touchend", ev => { if (x0 === null) return; const dx = ev.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); });
      if (lbKeys) document.removeEventListener("keydown", lbKeys);
      lbKeys = ev => { if (ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return; if (ev.key === "Escape") closeLightbox(); else if (ev.key === "ArrowRight") go(1); else if (ev.key === "ArrowLeft") go(-1); };
      document.addEventListener("keydown", lbKeys);
      const box = h("div", { class: "bb-lightbox", role: "dialog", "aria-modal": "true", "aria-label": "Photo", tabindex: "-1" },
        h("div", { class: "bb-lb-bar" }, h("button", { class: "bb-btn bb-btn-small", type: "button", onclick: closeLightbox }, icon("x"), "Close"), h("span", { class: "bb-lb-count", text: (idx + 1) + " / " + ids.length })),
        stage, panel);
      if (lb) lb.replaceWith(box); else container.appendChild(box);
      lb = box; document.body.classList.add("bb-lock"); if (!rerender) box.focus({ preventScroll: true });
    }
    function replaceOriginal(p, file) {
      ui.toast("Uploading the original…");
      Promise.all([makeThumb(file), readExifMeta(file)]).then(([t, meta]) => api.replacePhoto(p.id, file, { thumb: t.thumb, width: t.width, height: t.height, taken_at: meta.taken_at, lat: meta.lat, lng: meta.lng }))
        .then(x => { patchPhoto(x); ui.toast("Replaced with the full-quality original (" + fmtBytes(file.size) + ")"); }, e => ui.toast(why(e)));
    }
    function editCaption(p) {
      const ta = h("textarea", { class: "bb-input", maxlength: "500", placeholder: "Say something about this photo" }, p.caption || "");
      const content = h("div", { class: "bb-sheet-body" }, h("h2", { text: "Caption" }), h("p", { class: "bb-hint", text: "It travels with the photo: fellows who save it to their camera roll get it as the Photos caption." }),
        h("label", { class: "bb-field" }, h("span", { text: "Caption" }), ta),
        h("div", { class: "bb-form-actions" }, h("button", { class: "bb-btn", type: "button", text: "Cancel", onclick: ui.close }), h("button", { class: "bb-btn bb-btn-primary", type: "button", text: "Save", onclick: () => { p.caption = ta.value.trim(); ui.close(); act(api.updatePhoto(p.id, { caption: p.caption }), patchPhoto); render(); } })));
      ui.open(content, "Caption"); setTimeout(() => ta.focus(), 50);
    }
    function moveToEvent(p) {
      const candidates = S.data.events.filter(e => !e.cancelled).sort((a, b) => b.starts_at - a.starts_at);
      let target = p.event_id || "";
      const content = h("div", { class: "bb-sheet-body" }, h("h2", { text: "Which album?" }),
        h("label", { class: "bb-field" }, h("span", { text: "Album" }), h("select", { class: "bb-input", onchange: ev => { target = ev.target.value; } }, h("option", { value: "", selected: !target, text: "Cohort album (everyone)" }), candidates.map(e => h("option", { value: e.id, selected: e.id === target, text: e.title + " · " + fmtDay(e.starts_at) })))),
        h("div", { class: "bb-form-actions" }, h("button", { class: "bb-btn", type: "button", text: "Cancel", onclick: ui.close }), h("button", { class: "bb-btn bb-btn-primary", type: "button", text: "Move", onclick: () => { p.event_id = target || null; act(api.updatePhoto(p.id, { eventId: target || null }), patchPhoto); ui.close(); ui.toast(target ? "Moved to " + event(target).title : "Moved to the cohort album"); render(); } })));
      ui.open(content, "Move photo");
    }

    /* ----- boot ----- */
    render(); load().then(() => { if (timers.pendingCode) { const c = timers.pendingCode; timers.pendingCode = null; openCheckinLink(c); } });
    return {
      reload: () => load(true),
      openCheckinLink,
      destroy() { destroyed = true; clearTimeout(timers.poll); clearInterval(timers.clock); document.removeEventListener("visibilitychange", wake); removeEventListener("focus", wake); removeEventListener("online", wake); closeLightbox(); ui.close(); container.textContent = ""; container.classList.remove("bb"); }
    };
  }

  root.BasecampBonding = { mount, _stampJpeg: stampJpeg, _readTakenAt: readTakenAt }; // the two helpers are exposed for tests
})(typeof window !== "undefined" ? window : this);
