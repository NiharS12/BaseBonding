// Who is calling?
//
// ===================================================================================
//  DEV TEAM: this is the ONE function to replace when merging into Pulse.
//  Pulse already sends `Authorization: Bearer <session token>` on every API.call();
//  swap the body of resolveFellow() for Pulse's own session → fellow lookup and return
//  `{ id, name, email, phone, photo_url, host_org, city, role }` (ids must match the fellow ids used in
//  the bb_* tables; if Pulse's roster lives elsewhere, point bb_fellows at it or keep it
//  in sync). Everything else in this worker only ever calls resolveFellow().
// ===================================================================================
//
// Reference/dev behaviour (no real sessions):
//   * `Authorization: Bearer dev:<fellowId>`
//   * or `X-Dev-Fellow: <fellowId>`
// where <fellowId> is a row in bb_fellows (see seed.sql). Anything else → 401 signed_out.

import { ApiError } from './util.js';

export async function resolveFellow(request, env) {
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  let fellowId = null;

  if (bearer.startsWith('dev:')) fellowId = bearer.slice(4).trim();
  if (!fellowId) fellowId = (request.headers.get('x-dev-fellow') || '').trim() || null;

  // PULSE_SHARED_SECRET is reserved for the real implementation (e.g. verifying a token
  // minted by Pulse). It is intentionally unused by the dev scheme above.

  if (!fellowId) throw new ApiError('signed_out', 401);
  const me = await env.DB.prepare('SELECT id, name, email, phone, photo_url, host_org, city, role FROM bb_fellows WHERE id = ?1')
    .bind(fellowId)
    .first();
  if (!me) throw new ApiError('signed_out', 401);
  return me;
}
