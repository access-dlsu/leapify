import type { UserRole } from '../db/schema/users'

/**
 * Claims extracted from a Google OAuth 2.0 ID token (GIS).
 * Used when authenticating via Google Identity Services.
 */
export interface GoogleTokenClaims {
  iss: 'https://accounts.google.com'
  aud: string // OAuth client ID
  sub: string // Google user ID
  iat: number
  exp: number
  email: string
  email_verified: boolean
  name?: string
  picture?: string
  given_name?: string
  family_name?: string
  locale?: string
  hd?: string // hosted domain (e.g., "dlsu.edu.ph")
}

/**
 * Extended user combining token claims + D1 role.
 * This is what gets cached in KV and set on c.var.user.
 */
export interface LeapifyUser extends GoogleTokenClaims {
  uid: string // alias for sub, for convenience
  dbId: string // D1 users.id
  role: UserRole
}
