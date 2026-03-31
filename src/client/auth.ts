/**
 * Firebase auth helper for Leapify API consumers.
 * Uses duck typing — no Firebase SDK dependency on this package.
 *
 * @example
 * import { getLeapifyToken } from 'leapify/client'
 * import { auth } from '@/lib/firebase'
 *
 * const token = await getLeapifyToken(auth.currentUser)
 */

/**
 * Minimal interface for a Firebase User object.
 * Compatible with `firebase/auth` User without importing the SDK.
 */
export interface FirebaseUserLike {
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

/**
 * Extracts a fresh Firebase ID token from the current user.
 * Returns null for unauthenticated (guest) users.
 *
 * Pass the result to `createLeapifyClient` as the `getToken` function, or
 * call it directly before authenticated API requests.
 */
export async function getLeapifyToken(
  user: FirebaseUserLike | null,
): Promise<string | null> {
  if (!user) return null;
  return user.getIdToken();
}
