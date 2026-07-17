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
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts', '**/*.config.*', '.next/**', 'tests/**'],
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
            // Floors are a regression backstop (cap 90 lines/stmts/funcs, 85
            // branches), NOT a target — genuine coverage of key logic/flows/
            // branches is ensured by the pre-PR coverage review (see
            // docs/workflow.md). lib functions (87) and branches (80) stay
            // below the cap: CI's prod-clone data measures them lower than
            // local test data, so they keep honest-measured slack.
            thresholds: {
              'lib/**/*.ts': { lines: 90, branches: 80, functions: 87, statements: 90 },
              'app/**/actions.ts': { lines: 90, branches: 82, functions: 90, statements: 90 },
              'app/api/**/route.ts': { lines: 90, branches: 85, functions: 90, statements: 90 },
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
