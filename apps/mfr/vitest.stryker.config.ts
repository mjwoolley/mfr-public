import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const alias = { '@': path.resolve(__dirname, '.') }

// Flat, unit-only vitest config for Stryker mutation runs. The main
// vitest.config.ts defines unit AND integration projects; mutating with
// DB-hitting integration tests would be unusably slow (and destructive), so
// stryker.config.json points here instead. Mirrors the unit project exactly.
export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '.next/**', 'tests/integration/**'],
  },
})
