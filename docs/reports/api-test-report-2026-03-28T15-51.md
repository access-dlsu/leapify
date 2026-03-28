# API Test Report — FINAL

**Execution Date:** 2026-03-29T01:15Z
**Test Runner:** Vitest v3.2.4
**Target:** Leapify Backend Module (Hono + Drizzle ORM)
**Result:** ✅ **ALL TESTS PASSING — 33/33**

---

## Execution Summary

| Metric | Value |
|--------|-------|
| Test Files | 5 |
| Total Tests | 33 |
| Passed | **33** |
| Failed | **0** |
| Duration | ~1.35s |

---

## Test Suites

| Suite | Tests | Status |
|-------|-------|--------|
| `tests/health.test.ts` | 1 | ✅ Pass |
| `tests/events.test.ts` | 13 | ✅ Pass |
| `tests/users.test.ts` | 9 | ✅ Pass |
| `tests/faqs.test.ts` | 7 | ✅ Pass |
| `tests/site-config.test.ts` | 3 | ✅ Pass |

---

## Root Causes Resolved

### 1. `SQLiteD1Session.prepare` — 500 on All DB Operations
- **Root Cause:** Per-test `vi.mock('../../src/db')` replaced `createDb` but the Drizzle instance still used the D1 session internally. Calls to `.update().returning()` required `D1Database.prepare()` on the fake `{}` binding — which doesn't exist.
- **Fix:** `tests/helpers/setup.ts` mocks `drizzle-orm/d1`'s `drizzle()` export at the module level (via `setupFiles`). Every `drizzle(d1, schema)` call now silently returns the `better-sqlite3` instance.

### 2. SQL `DEFAULT true`/`DEFAULT false` — SQLite Incompatibility
- **Root Cause:** Drizzle-kit generates MySQL/Postgres-style boolean literals. SQLite requires `0`/`1`.
- **Fix:** `setup.ts` pre-processes the migration SQL, replacing `DEFAULT true → DEFAULT 1` / `DEFAULT false → DEFAULT 0`, and strips `-->statement-breakpoint` markers before `sqlite.exec()`.

### 3. 401 on All Protected Routes — Fake Token Not JWT-Shaped
- **Root Cause:** Auth middleware extracts UID from `token.split('.')[1]` for KV cache lookup. Plain strings like `'admin-token'` split into 1 part, UID is `undefined`, KV lookup skipped, full JWT verification runs and rejects the malformed token.
- **Fix:** `tests/helpers/auth.ts` — `makeTestToken(uid)` builds a real 3-part base64url JWT. `seedUserInKV(kv, uid, role, dbId)` pre-seeds the KV auth cache. Middleware finds a cache hit and bypasses Firebase verification entirely.

### 4. Missing Drizzle `relations()` — Bookmark Join Fails (Production Bug)
- **Root Cause:** `db.query.bookmarks.findMany({ with: { event: true } })` requires explicit `relations()` declarations. The schema only had FK column references.
- **Fix:** Added `bookmarksRelations` to `src/db/schema/bookmarks.ts`. This was a **production bug** — the route would have crashed in production too.

---

## Test Environment Architecture

```
tests/helpers/setup.ts  (setupFiles — runs before every test file)
  └── vi.mock('drizzle-orm/d1') → returns better-sqlite3 instance
        └── Migration SQL pre-processed (boolean + breakpoint fixes)

tests/helpers/auth.ts
  ├── makeTestToken(uid) → valid 3-part JWT string
  └── seedUserInKV(kv, uid, role, dbId) → warm auth KV cache

tests/helpers/app.ts
  ├── createMockKV() → Map-backed KV with JSON-aware get(key, 'json')
  └── createTestApp() → { app, env, kv }
```
