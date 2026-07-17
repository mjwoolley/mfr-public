import { defineConfig, devices } from '@playwright/test'

/**
 * E2E smoke tests for the unified MFR app.
 *
 * One app, one origin, one database. The former three apps (web /
 * reservations / accounting) are now a single Next.js app served at
 * http://localhost:3100, exposing the portal at `/`, reservations at
 * `/reservations/*`, accounting at `/accounting/*`, and a single Auth.js
 * handler at `/api/auth`. The four per-domain Neon databases are now one
 * unified database (identity + portal + reservations + accounting tables).
 *
 * Auth strategy: sessions are database-strategy (Auth.js DrizzleAdapter), so
 * global-setup seeds users + session rows directly into the DB and the tests
 * attach the matching `authjs.session-token` cookie. There is no test-login
 * code path — nothing to accidentally ship to production. The cookie is
 * host-only on localhost, so one seeded session authenticates every section.
 *
 * Database: point E2E_DATABASE_URL (pooled) + E2E_DIRECT_URL (direct, used by
 * global-setup to truncate/seed) at a DEDICATED Neon branch (CI creates an
 * ephemeral one from `production`; locally use the `test` branch — NEVER
 * production). Global-setup TRUNCATES tables in that database.
 *
 * The app is served with `next start`, so build it first:
 *   npm run build -w apps/mfr
 * then run:
 *   npm run e2e
 */

export const WEB_URL = 'http://localhost:3100'
// Same origin now — reservations and accounting are path sections of the one
// app, not separate servers. Specs navigate via `${RESERVATIONS_URL}/reservations/…`
// and `${ACCOUNTING_URL}/accounting/…`, so these resolve to the section paths
// on the single origin.
export const RESERVATIONS_URL = WEB_URL
export const ACCOUNTING_URL = WEB_URL

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set. E2E tests need a dedicated Neon branch URL ` +
        `(global-setup truncates this database — never point it at production).`,
    )
  }
  return value
}

export default defineConfig({
  testDir: './e2e/tests',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  // One worker: the admin-edge specs mutate cross-cutting state (user
  // status, booking rules, blocked dates) that other spec files assert
  // against — parallel workers would race. The whole suite is ~1 minute.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run start -w apps/mfr -- --port 3100',
    url: WEB_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // The one unified database. DATABASE_URL is the pooled URL every server
      // module reads; DIRECT_URL is carried for parity with the app's env
      // (migrations/direct access) though the running server uses DATABASE_URL.
      DATABASE_URL: requireEnv('E2E_DATABASE_URL'),
      DIRECT_URL: process.env.E2E_DIRECT_URL ?? requireEnv('E2E_DATABASE_URL'),
      // AUTH_SECRET must merely be present and stable (database sessions);
      // Google creds are never exercised (tests sign in via seeded session
      // rows, not OAuth) but the config requires them to be set.
      AUTH_SECRET: 'e2e-not-a-real-secret',
      AUTH_GOOGLE_ID: 'e2e-google-id',
      AUTH_GOOGLE_SECRET: 'e2e-google-secret',
      AUTH_TRUST_HOST: 'true',
      AUTH_URL: `${WEB_URL}/api/auth`,
      LOG_LEVEL: 'warn',
      // Dummy email creds so the accounting/reservations notification modules
      // import cleanly; email is never actually sent in e2e.
      RESEND_API_KEY: 're_e2e_dummy',
      EMAIL_FROM: 'e2e@example.test',
    },
  },
})
