import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Global setup runs before every test file; it mocks drizzle-orm/d1 so
    // the D1 session is replaced by an in-memory better-sqlite3 instance.
    setupFiles: ['tests/helpers/setup.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
    server: {
      deps: {
        external: ['better-sqlite3'],
      },
    },
  },
})
