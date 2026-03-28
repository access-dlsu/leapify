import { cors } from 'hono/cors'

export function createCorsMiddleware(allowedOrigins: string[]) {
  return cors({
    origin: allowedOrigins,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['ETag', 'Last-Modified', 'Cache-Control'],
    maxAge: 86400,
    credentials: true,
  })
}
