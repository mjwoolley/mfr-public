// Playwright against an already-deployed preview URL.
//
// Deliberately NOT playwright.config.ts. That config starts a local server and
// runs `e2e/global-setup.ts`, which TRUNCATES about twenty tables — pointing it
// at a deployed environment would wipe that environment's database. This config
// has no globalSetup and no webServer: it only drives a running deployment.
//
//   PREVIEW_URL=https://<preview>.vercel.app SMOKE_SESSION_TOKEN=... npm run e2e:preview
import { defineConfig, devices } from '@playwright/test'

const PREVIEW_URL = process.env.PREVIEW_URL

export default defineConfig({
  testDir: './e2e/preview',
  fullyParallel: false,
  workers: 1,
  // Comfortably above the spec's 90s upload wait. Playwright's 30s default fires
  // mid-upload and kills the test before it can report the app's error — which
  // is the one thing this suite exists to surface.
  timeout: 180_000,
  // These specs write to the shared production blob store, so a retry storm is
  // worse than a clean failure. One retry absorbs a flaky cold start.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: PREVIEW_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
