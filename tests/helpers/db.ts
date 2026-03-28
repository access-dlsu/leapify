import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../src/db/schema'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Creates a fresh in-memory SQLite database seeded with the Drizzle schema.
 *
 * Root-cause fixes applied here:
 *   1. Strip drizzle-kit --> statement-breakpoint comments before execution.
 *   2. Replace bare `true`/`false` literals in DEFAULT clauses with 1/0.
 *      SQLite does not recognise boolean literals; D1 & drizzle-kit emit
 *      them but better-sqlite3 will throw on CREATE TABLE otherwise.
 */
export function createMemoryDb() {
  const sqlite = new Database(':memory:')

  const migrationsPath = path.resolve(__dirname, '../../drizzle')
  const files = fs.readdirSync(migrationsPath).filter(f => f.endsWith('.sql'))
  if (!files.length) throw new Error('No drizzle SQL migration file found')

  // Use the first (and only) migration file
  let rawSql = fs.readFileSync(path.join(migrationsPath, files[0]!), 'utf-8')

  // Fix 1: Remove drizzle-kit statement-breakpoint markers
  rawSql = rawSql.replace(/-->.*?(\n|$)/g, '\n')

  // Fix 2: Replace bare boolean DEFAULT values that SQLite cannot parse.
  //         e.g.  DEFAULT false  →  DEFAULT 0
  //         e.g.  DEFAULT true   →  DEFAULT 1
  rawSql = rawSql.replace(/DEFAULT\s+false/gi, 'DEFAULT 0')
  rawSql = rawSql.replace(/DEFAULT\s+true/gi, 'DEFAULT 1')

  sqlite.exec(rawSql)

  return drizzle(sqlite, { schema })
}
