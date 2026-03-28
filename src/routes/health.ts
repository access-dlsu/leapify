import { Hono } from 'hono'
import type { LeapifyEnv } from '../types'

export const healthRoute = new Hono<LeapifyEnv>()

healthRoute.get('/', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})
