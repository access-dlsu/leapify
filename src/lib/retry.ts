export interface RetryOptions {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  shouldRetry?: (error: unknown) => boolean
}

/**
 * Retry an async function with exponential backoff + jitter.
 * Default: 3 attempts, 100ms base delay, 5s max delay.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 100,
    maxDelayMs = 5000,
    shouldRetry = defaultShouldRetry,
  } = options

  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt === maxAttempts || !shouldRetry(error)) throw error

      const exponential = baseDelayMs * 2 ** (attempt - 1)
      const jitter = Math.random() * 50
      const delay = Math.min(exponential + jitter, maxDelayMs)

      await sleep(delay)
    }
  }

  throw lastError
}

function defaultShouldRetry(error: unknown): boolean {
  // Retry on 429 and 5xx HTTP errors
  if (error instanceof Response) {
    return error.status === 429 || error.status >= 500
  }
  return true
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
