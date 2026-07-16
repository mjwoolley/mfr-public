import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
      exclude: ['drizzle/**', 'tests/**', '**/*.test.ts', '**/*.config.*', '.next/**'],
    },
    projects: [
      {
        plugins: [tsconfigPaths()],
        test: {
          name: 'unit',
          environment: 'node',
          include: ['**/*.test.ts'],
          exclude: ['**/node_modules/**', 'tests/integration/**'],
        },
      },
      {
        plugins: [tsconfigPaths()],
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: ['tests/integration/setup.ts'],
          // All integration files share one test-branch database, and
          // booking_rules is a singleton row that admin.test.ts rewrites
          // (e.g. its bootstrap case sets a 2026 horizon) — with parallel
          // files that mutation lands mid-flight in reservations.test.ts's
          // 2027-date edits and 400s them. Serialize the files; each file
          // already manages its own fixtures.
          fileParallelism: false,
          // Route handlers under test import a module-load-time `db`
          // singleton (lib/db/client.ts) that reads process.env.DATABASE_URL
          // exactly once, at import time. A plain top-of-test-file
          // `process.env.DATABASE_URL = process.env.TEST_DATABASE_URL`
          // statement does NOT reliably run before that import: ES module
          // semantics evaluate a module's dependencies (including
          // lib/db/client.ts, transitively imported by the route handlers)
          // before the importing module's own top-level statements, even
          // ones that appear earlier in the source text. Verified empirically
          // in a throwaway probe test — the naive approach bound `db` to the
          // real DATABASE_URL host, not TEST_DATABASE_URL.
          //
          // Vitest's `test.env` is applied to process.env by the runner
          // before a worker evaluates the test file's module graph at all,
          // so it is not subject to that ordering problem. This is what
          // actually redirects the `db` singleton to the test branch.
          //
          // The same ordering gotcha applies identically to
          // lib/auth/identityDb.ts's module-load-time singleton, which reads
          // IDENTITY_DATABASE_URL — redirect it here too.
          env: {
            DATABASE_URL: process.env.TEST_DATABASE_URL,
            IDENTITY_DATABASE_URL: process.env.TEST_IDENTITY_DATABASE_URL,
            // Notifications resolve reservations admins from the portal DB.
            PORTAL_DATABASE_URL: process.env.TEST_PORTAL_DATABASE_URL,
          },
        },
      },
    ],
  },
})
