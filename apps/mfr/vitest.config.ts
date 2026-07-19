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
          exclude: [
            '**/node_modules/**',
            '.next/**',
            'tests/integration/**',
            'tests/accounting-integration/**',
            'tests/reservations-integration/**',
            'tests/photos-integration/**',
          ],
          // Every client now reads the single DATABASE_URL and throws at module
          // load if it is unset. Pure unit tests that merely import a lib module
          // which loads a client need a dummy URL — postgres is lazy and never
          // connects unless a query runs.
          env: {
            DATABASE_URL: 'postgresql://unit:unit@localhost:5432/unit',
          },
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
          // Files share portal singletons (portal_settings, portal_meal_rsvps)
          // on the one test branch — serialize so they don't race.
          fileParallelism: false,
          // portalDb / identityDb / the unified db are module-load-time
          // singletons that all read DATABASE_URL once at import time. Set it via
          // test.env (applied before the worker evaluates the module graph) so
          // they point at the one unified test branch.
          env: {
            DATABASE_URL: process.env.TEST_DATABASE_URL,
          },
        },
      },
      {
        // Accounting integration suite (the Prisma->Drizzle safety net). Runs
        // against the unified `test` branch: the accounting business client
        // (db) and the identity client both read the single DATABASE_URL.
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'accounting-integration',
          environment: 'node',
          include: ['tests/accounting-integration/**/*.test.ts'],
          globalSetup: ['tests/accounting-integration/setup.ts'],
          env: {
            DATABASE_URL: process.env.TEST_DATABASE_URL,
          },
        },
      },
      {
        // Reservations integration suite (folded in from apps/reservations).
        // Runs against the unified `test` branch: the reservations route
        // handlers, the identity client, and the notifications admin-ids reader
        // all read the single DATABASE_URL.
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'reservations-integration',
          environment: 'node',
          include: ['tests/reservations-integration/**/*.test.ts'],
          globalSetup: ['tests/reservations-integration/setup.ts'],
          // booking_rules is a singleton row that admin.test.ts rewrites, so
          // parallel files race on it — serialize (each manages its fixtures).
          fileParallelism: false,
          env: {
            DATABASE_URL: process.env.TEST_DATABASE_URL,
          },
        },
      },
      {
        // Member photo-gallery integration suite: gallery read helpers + upload
        // actions against the unified `test` branch (portal_photos / backups /
        // roles + identity users). Blob uploads are mocked in the tests.
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'photos-integration',
          environment: 'node',
          include: ['tests/photos-integration/**/*.test.ts'],
          globalSetup: ['tests/photos-integration/setup.ts'],
          // Files share the portal_photos table — serialize so the global
          // truncate and per-test fixtures don't race across files.
          fileParallelism: false,
          env: {
            DATABASE_URL: process.env.TEST_DATABASE_URL,
          },
        },
      },
    ],
  },
})
