import type { LeapifyUser } from '../../src/auth/types'

const USER_KV_PREFIX = 'auth:user:'

/**
 * Build a fake token that LOOKS like a real Firebase JWT to the middleware.
 *
 * Root-cause: The middleware extracts the UID with a quick base64url decode
 * of the token payload (part[1]) before doing the KV cache check.  If the
 * token isn't a 3-part "header.payload.signature" string, `split('.')[1]`
 * is undefined, `uid` stays undefined, the KV lookup is skipped, and the
 * full `verifyFirebaseToken()` path runs — which rejects our fake string.
 *
 * Fix: We encode a minimal payload containing `sub` so the UID extraction
 * succeeds, then we pre-seed the KV with the full `LeapifyUser` object
 * under that UID key.  The middleware finds the cache hit and short-circuits
 * WITHOUT ever calling verifyFirebaseToken.
 */
export function makeTestToken(uid: string): string {
  const header  = btoa(JSON.stringify({ alg: 'RS256', kid: 'test-kid' }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const payload = btoa(JSON.stringify({
    sub: uid,
    iss: 'https://securetoken.google.com/test-project',
    aud: 'test-project',
    iat: Math.floor(Date.now() / 1000) - 60,
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: `${uid}@dlsu.edu.ph`,
    email_verified: true,
  }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  // Signature is arbitrary; it never gets verified because the KV hits first
  const sig = 'fakesig'
  return `${header}.${payload}.${sig}`
}

/**
 * Pre-seed the mock KV namespace with a cached LeapifyUser for the given UID.
 * When the middleware does `KV.get('auth:user:<uid>', 'json')` it will find
 * this object and skip Firebase verification entirely.
 */
export async function seedUserInKV(
  kv: any,
  uid: string,
  role: LeapifyUser['role'],
  dbId: string,
): Promise<LeapifyUser> {
  const leapifyUser: LeapifyUser = {
    uid,
    sub: uid,
    dbId,
    role,
    iss: 'https://securetoken.google.com/test-project',
    aud: 'test-project',
    iat: Math.floor(Date.now() / 1000) - 60,
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: `${uid}@dlsu.edu.ph`,
    email_verified: true,
    name: role === 'admin' ? 'Test Admin' : 'Test Student',
  }
  // Store as JSON string so the mock KV can return it parsed on get(..., 'json')
  await kv.put(`${USER_KV_PREFIX}${uid}`, JSON.stringify(leapifyUser))
  return leapifyUser
}
