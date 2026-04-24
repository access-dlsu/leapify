import type { GoogleTokenClaims } from './types'
import { unauthorized } from '../lib/errors'

/**
 * JWK endpoint for Google OAuth 2.0 ID tokens.
 * https://www.googleapis.com/oauth2/v3/certs
 */
const GOOGLE_OAUTH_JWK_URL = 'https://www.googleapis.com/oauth2/v3/certs'

export type CertsMap = Record<string, JsonWebKey>

// Helpers

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    '=',
  )
  const binary = atob(padded)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

function base64urlDecodeString(str: string): string {
  const bytes = base64urlDecode(str)
  return new TextDecoder().decode(bytes)
}

// Public API

/**
 * Fetch Google OAuth public signing keys in JWK format.
 *
 * Used for verifying Google Identity Services (GIS) ID tokens.
 * Returns a map of { kid → JsonWebKey } and the cache TTL.
 *
 * Store the result in KV and reuse until TTL expires to avoid hitting Google
 * on every request.
 */
export async function fetchGoogleOAuthCerts(): Promise<{
  certs: CertsMap
  ttl: number
}> {
  const response = await fetch(GOOGLE_OAUTH_JWK_URL)
  if (!response.ok) throw new Error('Failed to fetch Google OAuth public JWKs')

  const body = (await response.json()) as {
    keys: (JsonWebKey & { kid: string })[]
  }

  // Build kid → JWK map
  const certs: CertsMap = {}
  for (const key of body.keys) {
    if (key.kid) certs[key.kid] = key
  }

  // Parse max-age from Cache-Control for KV TTL
  const cacheControl = response.headers.get('Cache-Control') ?? ''
  const match = cacheControl.match(/max-age=(\d+)/)
  const ttl = match ? parseInt(match[1]) : 21600 // default 6 hours

  return { certs, ttl }
}

/**
 * Verify a Google OAuth 2.0 ID token (from GIS).
 *
 * Uses JWK-format public keys fetched from Google's JWK endpoint — no
 * X.509 certificate parsing needed. Fully edge-compatible.
 *
 * @param token      - Raw Google JWT string from GIS callback
 * @param clientId   - OAuth client ID (must match aud claim)
 * @param getCerts   - Async function returning the cached kid → JsonWebKey map
 */
export async function verifyGoogleToken(
  token: string,
  clientId: string,
  getCerts: () => Promise<CertsMap>,
): Promise<GoogleTokenClaims> {
  const parts = token.split('.')
  if (parts.length !== 3) throw unauthorized('Malformed token')

  const [headerB64, payloadB64, signatureB64] = parts as [
    string,
    string,
    string,
  ]

  // Decode header to get kid (key ID)
  let header: { alg: string; kid: string }
  try {
    header = JSON.parse(base64urlDecodeString(headerB64))
  } catch {
    throw unauthorized('Invalid token header')
  }

  if (header.alg !== 'RS256') throw unauthorized('Unsupported token algorithm')

  // Look up the matching JWK by kid
  const certs = await getCerts()
  const jwk = certs[header.kid]
  if (!jwk) throw unauthorized('Unknown token key ID')

  // Import the JWK directly — no certificate/DER parsing needed
  let publicKey: CryptoKey
  try {
    publicKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    )
  } catch (e) {
    throw unauthorized(`Failed to import public key: ${(e as Error).message}`)
  }

  // Verify signature over header.payload
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  const signature = base64urlDecode(signatureB64)

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    signature.buffer as ArrayBuffer,
    signingInput,
  )
  if (!valid) throw unauthorized('Invalid token signature')

  // Decode and validate standard claims
  let claims: GoogleTokenClaims & { sub: string }
  try {
    claims = JSON.parse(base64urlDecodeString(payloadB64))
  } catch {
    throw unauthorized('Invalid token payload')
  }

  const now = Math.floor(Date.now() / 1000)

  if (claims.exp < now) throw unauthorized('Token has expired')
  if (claims.iat > now + 300) throw unauthorized('Token issued in the future')

  // Validate issuer and audience for Google OAuth tokens
  if (claims.iss !== 'https://accounts.google.com') {
    throw unauthorized('Invalid token issuer')
  }
  if (claims.aud !== clientId) {
    throw unauthorized('Invalid token audience')
  }

  if (!claims.sub) throw unauthorized('Missing token subject')

  return claims
}
