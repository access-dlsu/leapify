/**
 * Global Vitest setup — runs before every test file.
 *
 * Root-cause fix: `src/db/index.ts` calls `drizzle(d1, { schema })` using the
 * `drizzle-orm/d1` adapter, which builds a `SQLiteD1Session` internally.
 * When our tests pass a fake `{}` as the D1 binding, `SQLiteD1Session.prepare`
 * fails with "this.client.prepare is not a function".
 *
 * We intercept `drizzle-orm/d1` at the module level and replace its `drizzle`
 * export with one that always returns a `better-sqlite3`-backed instance.
 * The in-memory DB state is managed per-test via the `getDb`/`resetDb` helpers.
 */
import { vi } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle as bsDrizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../src/db/schema'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The single shared SQLite DB instance for the current test file.
// Reset in beforeEach by calling resetTestDb().
let currentDb: ReturnType<typeof bsDrizzle>

function buildDb() {
  const migrationsPath = path.resolve(__dirname, '../../drizzle')
  const files = fs.readdirSync(migrationsPath).filter(f => f.endsWith('.sql'))
  if (!files.length) throw new Error('No drizzle SQL migration file found')

  let rawSql = fs.readFileSync(path.join(migrationsPath, files[0]!), 'utf-8')
  // Strip drizzle-kit statement-breakpoint comments
  rawSql = rawSql.replace(/--!?>.*?(\n|$)/g, '\n')
  // SQLite does not accept bare `true`/`false` — replace with 1/0
  rawSql = rawSql.replace(/DEFAULT\s+false/gi, 'DEFAULT 0')
  rawSql = rawSql.replace(/DEFAULT\s+true/gi, 'DEFAULT 1')

  const sqlite = new Database(':memory:')
  sqlite.exec(rawSql)
  return bsDrizzle(sqlite, { schema })
}

// Bootstrap the first DB
currentDb = buildDb()

// Exported so every test's beforeEach can call resetTestDb()
export function resetTestDb() {
  currentDb = buildDb()
}

export function getTestDb() {
  return currentDb
}

// Replace drizzle-orm/d1's `drizzle()` so that whenever src/db/index.ts calls
// `drizzle(d1Binding, { schema })`, it silently returns our in-memory instance.
vi.mock('drizzle-orm/d1', () => ({
  drizzle: (_d1: unknown, _opts: unknown) => currentDb,
}))
