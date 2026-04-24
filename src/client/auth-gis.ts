/**
 * Google Identity Services (GIS) sign-in for Leapify.
 *
 * GIS is the recommended sign-in method for Leapify.
 * It's free, has no rate limits, and works reliably on all browsers including mobile.
 *
 * @example
 * import { initGoogleSignIn, signInWithGoogle, getLeapifyTokenFromJwt } from 'leapify/client'
 *
 * // Initialize once on app load
 * initGoogleSignIn({
 *   clientId: 'your-client-id.apps.googleusercontent.com',
 *   callback: async (jwt) => {
 *     // Send JWT directly to Leapify backend
 *     const token = await getLeapifyTokenFromJwt(jwt)
 *   },
 * })
 *
 * // Trigger sign-in from button click
 * document.getElementById('sign-in')?.addEventListener('click', signInWithGoogle)
 */

/**
 * Configuration for Google Identity Services.
 */
export interface GisConfig {
  /** Google OAuth 2.0 Client ID */
  clientId: string
  /** Callback function when user signs in */
  callback: (credential: string) => void | Promise<void>
  /** Restrict to specific domain (e.g., 'dlsu.edu.ph') */
  hostedDomain?: string
  /** Auto-select if only one Google account is available */
  autoSelect?: boolean
  /** Cancel prompt timer in seconds (default: 30) */
  cancelOnTapOutside?: boolean
  /** Context: 'signin', 'signup', or 'use' */
  context?: 'signin' | 'signup' | 'use'
}

/**
 * Google Identity Services API types (loaded via script tag).
 */
interface GoogleAccountsId {
  initialize: (config: {
    client_id: string
    callback: (response: { credential: string }) => void
    hosted_domain?: string
    auto_select?: boolean
    cancel_on_tap_outside?: boolean
    context?: string
    ux_mode?: 'popup' | 'redirect'
    login_uri?: string
  }) => void
  prompt: (
    momentListener?: (notification: PromptMomentNotification) => void,
  ) => void
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
  disableAutoSelect: () => void
  storeCredential: (credential: { id: string; password: string }) => void
  cancel: () => void
  revoke: (hint: string, callback: () => void) => void
}

interface PromptMomentNotification {
  isDisplayMoment: () => boolean
  isDisplayed: () => boolean
  isNotDisplayed: () => boolean
  getNotDisplayedReason: () => string
  isSkippedMoment: () => boolean
  getSkippedReason: () => string
  isDismissedMoment: () => boolean
  getDismissedReason: () => string
  getMomentType: () => string
}

interface GoogleAccounts {
  id: GoogleAccountsId
}

declare global {
  interface Window {
    google?: {
      accounts: GoogleAccounts
    }
  }
}

// Store config for getCurrentConfig() getter
let _storedConfig: GisConfig | null = null

/**
 * Get the current GIS configuration (if initialized).
 */
export function getCurrentGisConfig(): GisConfig | null {
  return _storedConfig
}

/**
 * Check if the GIS script is loaded.
 */
function isGisLoaded(): boolean {
  return typeof window !== 'undefined' && !!window.google?.accounts?.id
}

/**
 * Wait for the GIS script to load.
 */
function waitForGis(timeout = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isGisLoaded()) return resolve()

    const startTime = Date.now()
    const interval = setInterval(() => {
      if (isGisLoaded()) {
        clearInterval(interval)
        resolve()
      } else if (Date.now() - startTime > timeout) {
        clearInterval(interval)
        reject(new Error('Google Identity Services script failed to load'))
      }
    }, 100)
  })
}

/**
 * Initialize Google Identity Services.
 *
 * Call this once on app load. It loads the GIS script if not already present
 * and configures the sign-in flow.
 *
 * @example
 * initGoogleSignIn({
 *   clientId: '123456789.apps.googleusercontent.com',
 *   callback: async (jwt) => {
 *     const res = await fetch('/api/auth/gis', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({ idToken: jwt }),
 *     })
 *   },
 *   hostedDomain: 'dlsu.edu.ph',
 * })
 */
export async function initGoogleSignIn(config: GisConfig): Promise<void> {
  _storedConfig = config

  // Load GIS script if not present
  if (typeof document !== 'undefined' && !isGisLoaded()) {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    document.head.appendChild(script)
  }

  await waitForGis()

  // Build config object, only including defined properties
  const initConfig: {
    client_id: string
    callback: (response: { credential: string }) => void
    hosted_domain?: string
    auto_select?: boolean
    cancel_on_tap_outside?: boolean
    context?: string
  } = {
    client_id: config.clientId,
    callback: (response) => {
      if (response.credential) {
        config.callback(response.credential)
      }
    },
  }

  if (config.hostedDomain !== undefined) {
    initConfig.hosted_domain = config.hostedDomain
  }
  if (config.autoSelect !== undefined) {
    initConfig.auto_select = config.autoSelect
  }
  if (config.cancelOnTapOutside !== undefined) {
    initConfig.cancel_on_tap_outside = config.cancelOnTapOutside
  }
  if (config.context !== undefined) {
    initConfig.context = config.context
  }

  window.google!.accounts.id.initialize(initConfig)
}

/**
 * Show the Google One Tap prompt or sign-in button.
 *
 * Call this from a user gesture (button click) for best results.
 *
 * @example
 * document.getElementById('sign-in')?.addEventListener('click', signInWithGoogle)
 */
export function signInWithGoogle(): void {
  if (!isGisLoaded()) {
    throw new Error(
      'Google Identity Services not loaded. Call initGoogleSignIn() first.',
    )
  }

  window.google!.accounts.id.prompt()
}

/**
 * Render a Google Sign-In button in a container.
 *
 * @param container - HTML element to render the button in
 * @param options - Customization options for the button
 *
 * @example
 * renderGoogleButton(document.getElementById('google-signin'), {
 *   theme: 'outline',
 *   size: 'large',
 *   text: 'signin_with',
 * })
 */
export function renderGoogleButton(
  container: HTMLElement,
  options: {
    theme?: 'outline' | 'filled_blue' | 'filled_black'
    size?: 'large' | 'medium' | 'small'
    text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
    shape?: 'rectangular' | 'pill' | 'circle' | 'square'
    width?: number | string
    logo_alignment?: 'left' | 'center'
    locale?: string
  } = {},
): void {
  if (!isGisLoaded()) {
    throw new Error(
      'Google Identity Services not loaded. Call initGoogleSignIn() first.',
    )
  }

  window.google!.accounts.id.renderButton(container, {
    type: 'standard',
    theme: options.theme ?? 'outline',
    size: options.size ?? 'large',
    text: options.text ?? 'signin_with',
    shape: options.shape ?? 'rectangular',
    logo_alignment: options.logo_alignment ?? 'left',
    width: options.width,
    locale: options.locale,
  })
}

/**
 * Disable auto-select for future prompts.
 * Useful when user explicitly signs out.
 */
export function disableGoogleAutoSelect(): void {
  if (isGisLoaded()) {
    window.google!.accounts.id.disableAutoSelect()
  }
}

/**
 * Revoke Google OAuth token.
 *
 * @param email - User's email to revoke
 */
export function revokeGoogleToken(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isGisLoaded()) {
      reject(
        new Error(
          'Google Identity Services not loaded. Call initGoogleSignIn() first.',
        ),
      )
      return
    }

    window.google!.accounts.id.revoke(email, () => {
      resolve()
    })
  })
}

/**
 * Use the Google JWT directly as the Leapify token.
 *
 * Leapify's backend accepts Google OAuth tokens directly from GIS.
 * No conversion needed — use the JWT as-is.
 *
 * @param jwt - The JWT string from GIS callback
 * @returns The same JWT (no conversion needed)
 *
 * @example
 * initGoogleSignIn({
 *   clientId: 'xxx.apps.googleusercontent.com',
 *   callback: async (jwt) => {
 *     // Use JWT directly with Leapify client
 *     const api = createLeapifyClient('https://api.leapify.com', () => jwt)
 *     const me = await api.getMe()
 *   },
 * })
 */
export function getLeapifyTokenFromJwt(jwt: string): string {
  return jwt
}
