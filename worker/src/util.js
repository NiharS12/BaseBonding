// Small shared helpers for the Basecamp Bonding worker.

/** Thrown by handlers; the router turns it into `{ error: code }` with the given HTTP status. */
export class ApiError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

export const uuid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Digits only; drops a leading US country code so +1 415… and 415… compare equal. */
export function normalizePhone(p) {
  const d = String(p || '').replace(/\D+/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

export function extFromType(contentType, filename) {
  const map = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
    'image/heic': 'heic', 'image/heif': 'heif', 'image/avif': 'avif', 'image/tiff': 'tif', 'image/bmp': 'bmp',
  };
  const fromName = (filename || '').match(/\.([a-z0-9]{2,5})$/i);
  return map[(contentType || '').toLowerCase().split(';')[0]] || (fromName ? fromName[1].toLowerCase() : 'bin');
}

export function base64ToBytes(b64) {
  const clean = String(b64).replace(/^data:[^,]*,/, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function timingSafeEqual(a, b) {
  const ea = new TextEncoder().encode(String(a));
  const eb = new TextEncoder().encode(String(b));
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

export async function hmac(algo, secret, message, encoding = 'hex') {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: algo }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
  if (encoding === 'base64') return btoa(String.fromCharCode(...sig));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
