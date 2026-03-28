import type { ErrorHandler } from 'hono'
import { LeapifyError } from '../errors'

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof LeapifyError) {
    return c.json(
      { error: { code: err.code, message: err.message } },
      err.statusCode as Parameters<typeof c.json>[1],
    )
  }

  console.error('[Leapify] Unhandled error:', err)

  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
    500,
  )
}
