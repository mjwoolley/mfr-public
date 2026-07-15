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
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
      exclude: ['**/*.test.{ts,tsx}', '**/*.config.*', '.next/**', 'tests/**'],
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
