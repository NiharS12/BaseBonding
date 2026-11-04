// Minimal EXIF reader for JPEGs, so every photo (in-app upload, Slack, email, text) gets its "taken at" moment and
// its GPS position indexed in bb_photos, whatever the sender's phone and route. The original bytes are never
// touched: the metadata also stays inside the file in R2, so downloads carry it back into the Photos app.
//
//   readExif(bytes, { timeZone }) -> { taken_at: ISO|null, lat: number|null, lng: number|null, width, height }
//
// Reads APP1 (TIFF: 0th IFD → Exif IFD → GPS IFD) and the SOF marker for pixel size. No dependencies.
// HEIC/PNG/WebP return nulls (their metadata still rides along untouched in the stored file).

const TAG = { ExifIFD: 0x8769, GPSIFD: 0x8825, DateTime: 0x0132, DateTimeOriginal: 0x9003, OffsetTimeOriginal: 0x9011, OffsetTime: 0x9010,
  GPSLatRef: 0x0001, GPSLat: 0x0002, GPSLngRef: 0x0003, GPSLng: 0x0004 };
const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

export function readExif(bytes, { timeZone = 'UTC' } = {}) {
  const out = { taken_at: null, lat: null, lng: null, width: null, height: null };
  try {
    if (!(bytes && bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8)) return out;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let i = 2, app1 = -1;
    while (i + 4 <= bytes.length && bytes[i] === 0xff) {
      const marker = bytes[i + 1], len = dv.getUint16(i + 2);
      if (marker === 0xe1 && app1 < 0 && bytes[i + 4] === 0x45 && bytes[i + 5] === 0x78 && bytes[i + 6] === 0x69 && bytes[i + 7] === 0x66) app1 = i + 10; // "Exif\0\0"
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        out.height = dv.getUint16(i + 5); out.width = dv.getUint16(i + 7); // SOFn: precision, height, width
      }
      if (marker === 0xda) break; // start of scan: no more headers
      i += 2 + len;
    }
    if (app1 < 0) return out;
    const t = app1; // TIFF header
    const le = bytes[t] === 0x49 && bytes[t + 1] === 0x49;
    const u16 = (o) => dv.getUint16(t + o, le), u32 = (o) => dv.getUint32(t + o, le);
    const ifd = (off) => { // -> Map(tag -> {type, count, valueOffset})
      const m = new Map(); if (!off || t + off + 2 > bytes.length) return m;
      const n = u16(off);
      for (let k = 0; k < n; k++) {
        const e = off + 2 + k * 12; if (t + e + 12 > bytes.length) break;
        const tag = u16(e), type = u16(e + 2), count = u32(e + 4), size = (SIZE[type] || 1) * count;
        m.set(tag, { type, count, off: size > 4 ? u32(e + 8) : e + 8 });
      }
      return m;
    };
    const ascii = (v) => { if (!v) return null; let s = ''; for (let k = 0; k < v.count && t + v.off + k < bytes.length; k++) { const c = bytes[t + v.off + k]; if (!c) break; s += String.fromCharCode(c); } return s.trim() || null; };
    const rationals = (v) => { if (!v || v.type !== 5) return null; const r = []; for (let k = 0; k < v.count; k++) { const o = v.off + k * 8; const d = u32(o + 4); r.push(d ? u32(o) / d : 0); } return r; };
    const ifd0 = ifd(u32(4));
    const exif = ifd0.has(TAG.ExifIFD) ? ifd(u32(ifd0.get(TAG.ExifIFD).off)) : new Map();
    const gps = ifd0.has(TAG.GPSIFD) ? ifd(u32(ifd0.get(TAG.GPSIFD).off)) : new Map();

    const dt = ascii(exif.get(TAG.DateTimeOriginal)) || ascii(ifd0.get(TAG.DateTime));
    const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(dt || '');
    if (m) {
      const offset = ascii(exif.get(TAG.OffsetTimeOriginal)) || ascii(exif.get(TAG.OffsetTime)); // "+02:00" when the phone wrote one
      const naive = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
      let ms;
      if (/^[+-]\d{2}:\d{2}$/.test(offset || '')) ms = naive - ((offset[0] === '-' ? -1 : 1) * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6))) * 60000);
      else ms = naive - zoneOffsetMs(timeZone, naive); // EXIF time is wall-clock local time: assume the cohort's zone
      if (Number.isFinite(ms) && ms > 0 && ms < Date.now() + 86400e3) out.taken_at = new Date(ms).toISOString();
    }
    const lat = rationals(gps.get(TAG.GPSLat)), lng = rationals(gps.get(TAG.GPSLng));
    if (lat && lng && lat.length >= 2 && lng.length >= 2) {
      const dms = (a) => a[0] + (a[1] || 0) / 60 + (a[2] || 0) / 3600;
      let la = dms(lat), ln = dms(lng);
      if ((ascii(gps.get(TAG.GPSLatRef)) || 'N').toUpperCase() === 'S') la = -la;
      if ((ascii(gps.get(TAG.GPSLngRef)) || 'E').toUpperCase() === 'W') ln = -ln;
      if (Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180 && (la || ln)) { out.lat = Math.round(la * 1e6) / 1e6; out.lng = Math.round(ln * 1e6) / 1e6; }
    }
  } catch { /* a damaged header is not an error: the photo is still stored */ }
  return out;
}

export function zoneOffsetMs(tz, at) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(at));
    const g = (x) => Number(parts.find((p) => p.type === x).value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second')) - Math.floor(at / 1000) * 1000;
  } catch { return 0; }
}
