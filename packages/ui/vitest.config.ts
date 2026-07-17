import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      // Explicit include = honest coverage: every src file is reported,
      // untested ones at 0%. The whole package is logic subset, so global
      // thresholds apply (ratchet floor — raise as tests are added, target 90).
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts', '**/*.config.*'],
      // Measured 100% across the board 2026-07-16; floored at 98 so new
      // components must ship with tests.
      thresholds: { lines: 98, branches: 98, functions: 98, statements: 98 },
    },
  },
})
