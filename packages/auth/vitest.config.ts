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
      // thresholds apply (ratchet floor — raise as tests are added, target 90).
      include: ['src/**/*.ts'],
      // **/drizzle/**, not drizzle/**: coverage excludes are matched against
      // ABSOLUTE paths (picomatch contains mode), so bare relative globs can
      // swallow everything when the checkout path contains the substring.
      exclude: ['**/drizzle/**', '**/*.test.ts', '**/*.d.ts', '**/*.config.*'],
      // Baseline measured 2026-07-16.
      thresholds: { lines: 44, branches: 39, functions: 48, statements: 44 },
    },
  },
})
