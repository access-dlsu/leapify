import type { FirebaseTokenClaims } from './types'
import { unauthorized } from '../lib/errors'

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'

export type GoogleCerts = Record<string, string>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

function base64urlDecodeString(str: string): string {
  const bytes = base64urlDecode(str)
  return new TextDecoder().decode(bytes)
}

/**
 * Import an X.509 PEM certificate as a CryptoKey for RS256 verification.
 * PEM certs from Google contain the full certificate, not just spki key bytes,
 * so we use 'spki' import via the SubtleCrypto API with a workaround:
 * we need to extract the public key from the certificate.
 *
 * For Cloudflare Workers, SubtleCrypto supports importKey with 'spki' for RSA.
 * We strip the PEM headers and decode the DER-encoded certificate to get spki bytes.
 */
async function importCertPublicKey(pem: string): Promise<CryptoKey> {
  // Strip PEM headers and decode base64 to get DER bytes
  const pemBody = pem
    .replace(/-----BEGIN CERTIFICATE-----/, '')
    .replace(/-----END CERTIFICATE-----/, '')
    .replace(/\s+/g, '')

  const derBytes = base64urlDecode(pemBody.replace(/\+/g, '-').replace(/\//g, '_'))

  // Import as spki — Workers' SubtleCrypto handles X.509 DER for RSA keys
  return crypto.subtle.importKey(
    'spki',
    derBytes.buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch Google's public certificates for Firebase token verification.
 * Returns the certs and their cache TTL from the Cache-Control header.
 */
export async function fetchGoogleCerts(): Promise<{ certs: GoogleCerts; ttl: number }> {
  const response = await fetch(GOOGLE_CERTS_URL)
  if (!response.ok) throw new Error('Failed to fetch Google public certs')

  const certs = (await response.json()) as GoogleCerts

  // Parse max-age for KV TTL
  const cacheControl = response.headers.get('Cache-Control') ?? ''
  const match = cacheControl.match(/max-age=(\d+)/)
  const ttl = match ? parseInt(match[1]) : 21600 // default 6 hours

  return { certs, ttl }
}

/**
 * Verify a Firebase RS256 ID token using the Web Crypto API.
 * Returns the decoded + validated claims.
 *
 * This is fully edge-compatible — no Firebase Admin SDK required.
 */
export async function verifyFirebaseToken(
  token: string,
  projectId: string,
  getCerts: () => Promise<GoogleCerts>,
): Promise<FirebaseTokenClaims> {
  const parts = token.split('.')
  if (parts.length !== 3) throw unauthorized('Malformed token')

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string]

  // Decode header → get kid
  let header: { alg: string; kid: string }
  try {
    header = JSON.parse(base64urlDecodeString(headerB64))
  } catch {
    throw unauthorized('Invalid token header')
  }

  if (header.alg !== 'RS256') throw unauthorized('Unsupported token algorithm')

  // Get the matching public cert
  const certs = await getCerts()
  const pem = certs[header.kid]
  if (!pem) throw unauthorized('Unknown token key ID')

  // Import and verify signature
  const publicKey = await importCertPublicKey(pem)
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  const signature = base64urlDecode(signatureB64)

  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature.buffer as ArrayBuffer, signingInput)
  if (!valid) throw unauthorized('Invalid token signature')

  // Decode and validate claims
  let claims: FirebaseTokenClaims & { sub: string }
  try {
    claims = JSON.parse(base64urlDecodeString(payloadB64))
  } catch {
    throw unauthorized('Invalid token payload')
  }

  const now = Math.floor(Date.now() / 1000)

  if (claims.exp < now) throw unauthorized('Token has expired')
  if (claims.iat > now + 300) throw unauthorized('Token issued in the future')
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) {
    throw unauthorized('Invalid token issuer')
  }
  if (claims.aud !== projectId) throw unauthorized('Invalid token audience')
  if (!claims.sub) throw unauthorized('Missing token subject')

  return claims
}
