import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const alias = { '@': path.resolve(__dirname, '.') }

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      // Explicit include = honest coverage: vitest only counts files imported
      // by tests unless include globs are set, in which case every matching
      // file is reported (untested files show up at 0%).
      include: ['app/**/*.{ts,tsx}', 'lib/**/*.ts'],
      // Segment-anchored (**/dir/**): vitest matches coverage excludes against
      // ABSOLUTE paths with picomatch `contains: true`, so a bare `tests/**`
      // silently excludes EVERY file when the checkout path contains the
      // substring `tests/` (e.g. a worktree named web-tests).
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts', '**/*.config.*', '**/.next/**', '**/tests/**'],
      // Thresholds are a ratchet floor on the logic subset only (glob keys,
      // matched relative to this directory). Pages/layouts/client components
      // are measured and reported but not thresholded — e2e covers them.
      // No top-level lines/branches/... keys here: global thresholds would
      // apply to ALL included files, pages included.
      // Raise these as tests are added (target: 90). CI enforces them in the
      // integration job, where the merged unit+integration run happens.
      ...(process.env.COVERAGE_UNIT_ONLY
        ? {} // unit-only local run: merged thresholds would spuriously fail
        : {
            // Baseline measured 2026-07-16 (merged unit+integration run).
            // lib branches floor comes from CI (59.67%) — its ephemeral
            // production-clone data exercises fewer branches than the local
            // test branch does.
            thresholds: {
              'lib/**/*.ts': { lines: 81, branches: 58, functions: 79, statements: 81 },
              'app/**/actions.ts': { lines: 95, branches: 56, functions: 92, statements: 91 },
              // Sole route is the NextAuth re-export, untested today — raise
              // from zero as tests land.
              'app/api/**/route.ts': { lines: 0, branches: 0, functions: 0, statements: 0 },
            },
          }),
    },
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['**/*.test.{ts,tsx}'],
          exclude: ['**/node_modules/**', '.next/**', 'tests/integration/**'],
        },
      },
      {
        // React plugin so JSX in transitively-imported @mfr/ui components
        // (via lib/portal.ts) transforms under the node test environment.
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: ['tests/integration/setup.ts'],
          // portalDb / identityDb are module-load-time singletons that read
          // PORTAL_DATABASE_URL / IDENTITY_DATABASE_URL once at import time.
          // Setting them via test.env (applied before the worker evaluates the
          // module graph) reliably points those singletons at the test
          // branches — see accounting/vitest.config.ts for the full rationale.
          env: {
            PORTAL_DATABASE_URL: process.env.TEST_PORTAL_DATABASE_URL,
            IDENTITY_DATABASE_URL: process.env.TEST_IDENTITY_DATABASE_URL,
          },
        },
      },
    ],
  },
})
