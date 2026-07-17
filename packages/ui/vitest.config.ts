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
      // thresholds apply.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts', '**/*.config.*'],
      // Floors are a regression backstop (90 lines/stmts/funcs, 85 branches),
      // NOT a target — genuine coverage of key logic/flows/branches is ensured
      // by the pre-PR coverage review (see docs/workflow.md). Measured 100%.
      thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
    },
  },
})
