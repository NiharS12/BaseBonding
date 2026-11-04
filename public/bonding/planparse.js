/*
 * Basecamp Bonding: plain-English plans. "Tacos at La Taqueria Friday 7pm" → { title, starts_at, ends_at, location }.
 * One file for both sides: the browser demo loads it as a script (window.BasecampBondingPlan) and the Worker imports it
 * (import '../../public/bonding/planparse.js'; globalThis.BasecampBondingPlan). No dependencies.
 *
 *   BasecampBondingPlan.parse(text, nowMs) -> null when the text has no usable date or time, else
 *     { title, starts_at, ends_at, location, when }   (ms timestamps in the local zone of the caller; `when` is a readable echo)
 *
 * Understands: today / tonight / tomorrow / weekday names ("fri", "next friday") / "nov 8" / "11/8" / "the 8th";
 * "7pm", "7:30 pm", "19:00", "noon", "7-9pm", "from 7 to 9"; "at <place>" / "@ <place>" / "where: <place>";
 * and "what: … when: … where: …" lines. Bare "at 7" means 7pm. Missing end = start + 2 h.
 */
(function (root) {
  "use strict";
  var H = 36e5, D = 24 * H;
  var DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  var MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  var TIME = "(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?|noon|midnight)?";

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function clean(s) { return String(s || "").replace(/\s+/g, " ").replace(/^[\s,.;:\-–—!]+|[\s,.;:\-–—!]+$/g, "").trim(); }

  // "what: tacos when: fri 7pm where: la taqueria" (any order, any line breaks) → fields; else null.
  function fielded(text) {
    var re = /\b(what|when|where|title|time|place|location)\s*[:=]\s*/ig, parts = [], m, last = null;
    while ((m = re.exec(text))) { if (last) parts.push([last.k, text.slice(last.i, m.index)]); last = { k: m[1].toLowerCase(), i: re.lastIndex }; }
    if (last) parts.push([last.k, text.slice(last.i)]);
    if (!parts.length) return null;
    var o = {};
    parts.forEach(function (p) { var k = p[0] === "title" ? "what" : p[0] === "time" ? "when" : (p[0] === "place" || p[0] === "location") ? "where" : p[0]; o[k] = clean(p[1]); });
    return o;
  }

  function toMinutes(h, mm, ap, bare) {
    h = +h; mm = +(mm || 0);
    if (h > 24 || mm > 59) return null;
    if (ap === "noon") return 12 * 60;
    if (ap === "midnight") return 0;
    ap = ap ? ap.charAt(0) : "";
    if (ap === "a") { if (h === 12) h = 0; }
    else if (ap === "p") { if (h < 12) h += 12; }
    else if (bare && h >= 1 && h <= 11) h += 12;   // "at 7" with no am/pm: an evening plan
    if (h === 24) h = 0;
    return h * 60 + mm;
  }

  // Finds a time (or a range) in the text. Returns { start, end, span:[i,j] } with minutes since midnight, or null.
  function findTime(text) {
    var r;
    // ranges: "7-9pm", "7pm-9pm", "7 to 9pm", "from 7:30 to 9"
    r = new RegExp("(?:\\bfrom\\s+)?\\b" + TIME + "\\s*(?:-|–|to|until|till)\\s*" + TIME + "\\b", "i").exec(text);
    if (r && (r[3] || r[6]) ) {
      var ap1 = r[3] || r[6], ap2 = r[6] || r[3];
      var a = toMinutes(r[1], r[2], ap1), b = toMinutes(r[4], r[5], ap2);
      if (a != null && b != null) { if (b <= a) b += 12 * 60; return { start: a, end: b, span: [r.index, r.index + r[0].length] }; }
    }
    // "7pm", "7:30 pm", "noon", "at 7", "19:00"
    r = /\b(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b(?!\s*(?:st|nd|rd|th|\/|-|\d))/i.exec(text);
    if (r) { var t = toMinutes(r[1], r[2], r[3], true); if (t != null) return { start: t, end: null, span: [r.index, r.index + r[0].length] }; }
    r = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i.exec(text);
    if (r) { var t2 = toMinutes(r[1], r[2], r[3]); if (t2 != null) return { start: t2, end: null, span: [r.index, r.index + r[0].length] }; }
    r = /\b(noon|midnight)\b/i.exec(text);
    if (r) return { start: toMinutes(12, 0, r[1].toLowerCase()), end: null, span: [r.index, r.index + r[0].length] };
    r = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(text);
    if (r) return { start: toMinutes(r[1], r[2], ""), end: null, span: [r.index, r.index + r[0].length] };
    return null;
  }

  // Finds a day. Returns { date (local midnight ms), span, evening } or null.
  function findDay(text, now) {
    var base = new Date(now); base.setHours(0, 0, 0, 0); var today = base.getTime();
    var r;
    if ((r = /\b(tonight|this evening)\b/i.exec(text))) return { date: today, span: [r.index, r.index + r[0].length], evening: true };
    if ((r = /\b(today)\b/i.exec(text))) return { date: today, span: [r.index, r.index + r[0].length] };
    if ((r = /\b(tomorrow|tmrw|tmr)\b/i.exec(text))) return { date: today + D, span: [r.index, r.index + r[0].length] };
    if ((r = /\b(?:(this|next)\s+)?(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)\b\.?/i.exec(text))) {
      var want = DAYS.findIndex(function (d) { return d.indexOf(r[2].toLowerCase().slice(0, 3)) === 0; });
      var cur = new Date(today).getDay(), ahead = (want - cur + 7) % 7;
      if (ahead === 0 && !/^this$/i.test(r[1] || "")) ahead = 7;             // "friday" said on a Friday means next week; "this friday" means today
      if (/^next$/i.test(r[1] || "") && ahead < 7 && ahead <= 2) ahead += 7;  // "next mon" said on a Saturday → the one after the coming Monday
      return { date: today + ahead * D, span: [r.index, r.index + r[0].length] };
    }
    var monthRe = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b|\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i;
    if ((r = monthRe.exec(text))) {
      var mi = MONTHS.findIndex(function (m) { return m.indexOf((r[1] || r[4]).toLowerCase().slice(0, 3)) === 0; });
      var dd = +(r[2] || r[3]), y = base.getFullYear(), d = new Date(y, mi, dd); if (d.getTime() < today - 30 * D) d = new Date(y + 1, mi, dd);
      return { date: d.getTime(), span: [r.index, r.index + r[0].length] };
    }
    if ((r = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(text))) {
      var y2 = r[3] ? (+r[3] < 100 ? 2000 + +r[3] : +r[3]) : base.getFullYear(), d2 = new Date(y2, +r[1] - 1, +r[2]);
      if (!r[3] && d2.getTime() < today - 30 * D) d2 = new Date(y2 + 1, +r[1] - 1, +r[2]);
      return { date: d2.getTime(), span: [r.index, r.index + r[0].length] };
    }
    if ((r = /\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/i.exec(text))) {
      var d3 = new Date(base.getFullYear(), base.getMonth(), +r[1]); if (d3.getTime() < today) d3.setMonth(d3.getMonth() + 1);
      return { date: d3.getTime(), span: [r.index, r.index + r[0].length] };
    }
    return null;
  }

  // Finds a place: "at <place>", "@ <place>", "in <place>" (a trailing phrase that is not a time). Returns { text, span } or null.
  function findPlace(text) {
    var re = /(?:^|[\s,])(?:at|@|in)\s+(?!\d)([^,.;!?\n]+?)(?=$|[,.;!?\n]|\s+(?:on|this|next|tonight|today|tomorrow|tmrw|at\s+\d|from\s+\d|\d{1,2}(?::\d{2})?\s*(?:am|pm)|sun|mon|tue|wed|thu|fri|sat)\b)/i, r = re.exec(text);
    if (!r || !clean(r[1])) return null;
    var i = text.indexOf(r[1], r.index);
    return { text: clean(r[1]), span: [r.index, i + r[1].length] };
  }

  function cut(text, spans) {
    spans = spans.filter(Boolean).sort(function (a, b) { return b[0] - a[0]; });
    spans.forEach(function (s) { text = text.slice(0, s[0]) + " " + text.slice(s[1]); });
    return text;
  }

  function parse(text, now) {
    now = now || Date.now();
    var raw = String(text || "").replace(/\r/g, "").trim(); if (!raw) return null;
    var body = raw.replace(/^\s*(?:plan|plans|event|new plan)\s*[:\-–]\s*/i, "");
    var f = fielded(body);
    var whenText = f ? (f.when || "") : body, whereText = f && f.where != null ? f.where : null, whatText = f ? (f.what || "") : null;
    var day = findDay(whenText, now), time = findTime(whenText);
    if (!day && !time) return null;
    if (!day) { var dayOnly = new Date(now); dayOnly.setHours(0, 0, 0, 0); day = { date: dayOnly.getTime() }; if (time.start * 60e3 + day.date < now - 15 * 60e3) day.date += D; }
    if (!time) time = { start: day.evening ? 19 * 60 : 18 * 60, end: null };
    var starts = day.date + time.start * 60e3, ends = time.end != null ? day.date + time.end * 60e3 : starts + 2 * H;
    var place = null, title;
    if (f) { place = whereText || (findPlace(whatText) || {}).text || null; title = whereText ? whatText : cut(whatText, [(findPlace(whatText) || {}).span]); }
    else {
      var rest = cut(body, [day.span, time.span]);
      var p = findPlace(rest); if (p) { place = p.text; rest = cut(rest, [p.span]); }
      title = rest;
    }
    title = clean(title).replace(/\s*\?+$/, "").replace(/\b(?:on|at|from|this|next)\s*$/i, "");
    var lead = /^(?:let'?s|lets|anyone (?:want to|wanna|up for|down for)|who'?s (?:in for|down for|up for)|wanna|want to|going to|heading to|get|grab|do|some|the)\s+/i;
    for (var k = 0; k < 3 && lead.test(title); k++) title = title.replace(lead, "");
    title = cap(clean(title)) || (place ? "Plans at " + place : "Plans");
    var when = new Date(starts);
    return { title: title.slice(0, 80), starts_at: starts, ends_at: ends, location: place ? cap(place).slice(0, 120) : "",
      when: when.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + " · " + when.toLocaleTimeString(undefined, { hour: "numeric", minute: when.getMinutes() ? "2-digit" : undefined }).replace(" ", "").toLowerCase() };
  }

  root.BasecampBondingPlan = { parse: parse };
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
