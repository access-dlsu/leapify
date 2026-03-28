import type { UserRole } from '../db/schema/users'

/**
 * Claims extracted from a Firebase RS256 ID token.
 */
export interface FirebaseTokenClaims {
  iss: string
  aud: string
  sub: string   // Firebase UID
  iat: number
  exp: number
  email: string
  email_verified: boolean
  name?: string
  picture?: string
}

/**
 * Extended user combining Firebase claims + D1 role.
 * This is what gets cached in KV and set on c.var.user.
 */
export interface LeapifyUser extends FirebaseTokenClaims {
  uid: string       // alias for sub, for convenience
  dbId: string      // D1 users.id
  role: UserRole
}
