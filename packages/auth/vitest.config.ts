import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      // Explicit include = honest coverage: every src file is reported,
      // untested ones at 0%. The whole package is logic subset, so global
      // thresholds apply.
      include: ['src/**/*.ts'],
      exclude: ['drizzle/**', '**/*.test.ts', '**/*.d.ts', '**/*.config.*'],
      // Floors are a regression backstop (90 lines/stmts/funcs, 85 branches),
      // NOT a target — genuine coverage of key logic/flows/branches is ensured
      // by the pre-PR coverage review (see docs/workflow.md). Measured 100%.
      thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
    },
  },
})
