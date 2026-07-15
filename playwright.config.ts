import { defineConfig, devices } from '@playwright/test'

/**
 * E2E smoke tests for all three apps.
 *
 * Auth strategy: sessions are database-strategy (Auth.js DrizzleAdapter), so
 * global-setup seeds users + session rows directly into the identity DB and
 * the tests attach the matching `authjs.session-token` cookie. There is no
 * test-login code path in any app — nothing to accidentally ship to
 * production. The cookie is host-only on localhost (cookies are not
 * port-scoped), so one seeded session authenticates against all three apps.
 *
 * Databases: point the E2E_* vars at DEDICATED Neon branches (CI creates
 * ephemeral ones from `production`; locally use the `test` branches — NEVER
 * production). Global-setup TRUNCATES tables in all three databases.
 *
 * The apps are served with `next start`, so build them first:
 *   npm run build
 * then run:
 *   npm run e2e
 */

export const WEB_URL = 'http://localhost:3100'
export const RESERVATIONS_URL = 'http://localhost:3101'
export const ACCOUNTING_URL = 'http://localhost:3102'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set. E2E tests need dedicated Neon branch URLs ` +
        `(global-setup truncates these databases — never point them at production).`,
    )
  }
  return value
}

// Shared across all three app servers. AUTH_SECRET must merely be identical
// across the apps (database sessions); Google creds are never exercised
// because tests sign in via seeded session rows, not OAuth.
const sharedEnv = {
  AUTH_SECRET: 'e2e-not-a-real-secret',
  AUTH_GOOGLE_ID: 'e2e-google-id',
  AUTH_GOOGLE_SECRET: 'e2e-google-secret',
  AUTH_TRUST_HOST: 'true',
  IDENTITY_DATABASE_URL: requireEnv('E2E_IDENTITY_DATABASE_URL'),
  // Every app's session callback reads portal roles from here.
  PORTAL_DATABASE_URL: requireEnv('E2E_PORTAL_DATABASE_URL'),
}

export default defineConfig({
  testDir: './e2e/tests',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run start -w apps/web -- --port 3100',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: sharedEnv,
    },
    {
      command: 'npm run start -w apps/reservations -- --port 3101',
      // login moved to the portal; wait on a public page that returns 200.
      url: `${RESERVATIONS_URL}/reservations/pending`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...sharedEnv,
        DATABASE_URL: requireEnv('E2E_RESERVATIONS_DATABASE_URL'),
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: 'npm run start -w apps/accounting -- --port 3102',
      // sign-in moved to the portal; wait on a public page that returns 200.
      url: `${ACCOUNTING_URL}/accounting/pending`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...sharedEnv,
        DATABASE_URL: requireEnv('E2E_ACCOUNTING_DATABASE_URL'),
        AUTH_URL: `${ACCOUNTING_URL}/accounting/api/auth`,
        APP_BASE_URL: `${ACCOUNTING_URL}/accounting`,
        RESEND_API_KEY: 're_e2e_dummy',
        EMAIL_FROM: 'e2e@example.test',
      },
    },
  ],
})
