import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    // Root-only option (NonProjectOptions): must live here, not inside a
    // project's `test` block. Needed so `npm run test:integration` exits 0
    // when the integration project matches zero test files (Tasks 2/3
    // haven't written any yet) instead of Vitest's default exit 1.
    passWithNoTests: true,
    projects: [
      {
        plugins: [tsconfigPaths()],
        test: {
          name: 'unit',
          environment: 'node',
          include: ['**/*.test.ts'],
          exclude: ['**/node_modules/**', 'tests/integration/**'],
        },
      },
      {
        plugins: [tsconfigPaths()],
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: ['tests/integration/setup.ts'],
        },
      },
    ],
  },
})
