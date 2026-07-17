import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Flat, unit-only vitest config for Stryker mutation runs. The main
// vitest.config.ts defines unit AND integration projects; mutating with
// DB-hitting integration tests would be unusably slow (and destructive), so
// stryker.config.json points here instead. Mirrors the unit project exactly.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', 'tests/integration/**'],
  },
})
