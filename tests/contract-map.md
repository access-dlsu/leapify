# Contract Map

**Inspected on:** 2026-03-28

## GET /health
| Plan Field | Actual Implementation |
|------------|-----------------------|
| Auth required | None (public) |
| Response shape | `{ status: 'ok' }` |

## GET /events
| Plan Field | Actual Implementation |
|------------|-----------------------|
| Auth required | None (public) |
| Response shape | `{ data: Event[] }` — only `status: 'published'` events |
| Cache headers | `Cache-Control: public, max-age=604800, stale-while-revalidate=86400` + `ETag` |
| 304 behavior | Returns 304 if `If-None-Match` matches current ETag |

## GET /events/:slug
| Plan Field | Actual Implementation |
|------------|-----------------------|
| Auth required | None (public) |
| Response shape | `{ data: Event }` |
| Not found | 404 if slug doesn't exist or is not 'published' |

## GET /events/:slug/slots
| Plan Field | Actual Implementation |
|------------|-----------------------|
| Auth required | None (public) |
| Response shape | `{ data: { available, total } }` |
| Cache headers | `Cache-Control: public, max-age=5, stale-while-revalidate=5` |

## POST /events
| Plan Field | Actual Implementation |
|------------|-----------------------|
| Auth required | `authMiddleware` + `adminMiddleware` (admin claim required) |
| Request body | Zod schema covering slug, title, etc. |
| Success response | `{ data: <created event> }` — 201 Created |

## PATCH /events/:slug
| Plan Field | Actual Implementation |
|------------|-----------------------|
| Auth required | `authMiddleware` + `adminMiddleware` (admin claim required) |
| Request body | Partial of Zod schema |
| Success response | `{ data: <updated event> }` — 200 OK |

## GET /users/me
| Plan Field | Actual Implementation |
|------------|-----------------------|
| Auth required | `optionalAuthMiddleware` (guest passthrough allowed) |
| Response shape | `{ data: User }` if authed, `{ data: null }` if guest |

## GET /users/me/bookmarks
| Plan Field | Actual Implementation |
|------------|-----------------------|
| Auth required | `optionalAuthMiddleware` (guest passthrough allowed) |
| Response shape | `{ data: [{ bookmarkedAt, event }] }` if authed, `{ data: [] }` if guest |

## POST /users/me/bookmarks/:eventId
| Plan Field | Actual Implementation |
|------------|-----------------------|
| Auth required | `authMiddleware` |
| Success response | `{ data: { bookmarked: true | false } }` (toggles bookmark) |

## DELETE /users/me/bookmarks/:eventId
| Plan Field | Actual Implementation |
|------------|-----------------------|
| Auth required | `authMiddleware` |
| Success response | `{ data: { bookmarked: false } }` |

## GET /faqs
| Plan Field | Actual Implementation |
|------------|-----------------------|
| Auth required | None (public) |
| Response shape | `{ data: FAQ[] }` (isActive = true only) |

## POST /faqs
| Plan Field | Actual Implementation |
|------------|-----------------------|
| Auth required | `authMiddleware` + `adminMiddleware` |
| Success response | `{ data: FAQ }` — 201 Created |

## PATCH /faqs/:id
| Plan Field | Actual Implementation |
|------------|-----------------------|
| Auth required | `authMiddleware` + `adminMiddleware` |
| Success response | `{ data: FAQ }` — 200 OK |

## DELETE /faqs/:id
| Plan Field | Actual Implementation |
|------------|-----------------------|
| Auth required | `authMiddleware` + `adminMiddleware` |
| Success response | `{ data: { deleted: true } }` — 200 OK |

## GET /config
| Plan Field | Actual Implementation |
|------------|-----------------------|
| Auth required | None (public) |
| Response shape | `{ data: { comingSoonUntil, siteEndsAt, ... } }` |

## PATCH /config/:key
| Plan Field | Actual Implementation |
|------------|-----------------------|
| Auth required | `authMiddleware` + `adminMiddleware` |
| Success response | `{ data: { key, value } }` — 200 OK |
