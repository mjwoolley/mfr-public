import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const app = fileURLToPath(new URL('../apps/mfr/', import.meta.url))
const require = createRequire(new URL('../apps/mfr/package.json', import.meta.url))
const vitest = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs')

test(
  'real Vitest shards merge coverage and only the merge enforces the application floors',
  { timeout: 120_000 },
  () => {
    const root = mkdtempSync(path.join(app, '.vitest-sharding-'))
    try {
      mkdirSync(path.join(root, 'lib'))
      writeFileSync(
        path.join(root, 'vitest.config.mjs'),
        `
      import app from '../vitest.config.ts'
      export default {
        ...app, root: ${JSON.stringify(root)},
        test: { ...app.test, projects: undefined, include: ['*.test.ts'],
          coverage: { ...app.test.coverage, reporter: ['json-summary'] } }
      }
    `,
      )
      writeFileSync(
        path.join(root, 'a.test.ts'),
        `import { test, expect } from 'vitest'
      import { a } from './lib/logic'
      test('a', () => { expect(a(true)).toBe(1); expect(a(false)).toBe(0) })`,
      )
      writeFileSync(
        path.join(root, 'b.test.ts'),
        `import { test, expect } from 'vitest'
      import { b } from './lib/logic'
      test('b', () => { expect(b(true)).toBe(2); expect(b(false)).toBe(0) })`,
      )
      const env = { ...process.env }
      delete env.COVERAGE_UNIT_ONLY
      delete env.COVERAGE_SHARD
      const run = (args, shard = false) =>
        execFileSync(process.execPath, [vitest, 'run', '--coverage', ...args], {
          cwd: root,
          env: { ...env, ...(shard ? { COVERAGE_SHARD: '1' } : {}) },
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 30_000,
        })
      for (const regression of [false, true]) {
        writeFileSync(
          path.join(root, 'lib/logic.ts'),
          `
        export function a(flag: boolean) { return flag ? 1 : 0 }
        export function b(flag: boolean) { return flag ? 2 : 0 }
        ${regression ? 'export function untested() { return 99 }' : ''}
      `,
        )
        for (const shard of [1, 2]) {
          run([`--shard=${shard}/2`, '--reporter=blob'], true)
          assert.ok(readFileSync(path.join(root, `.vitest-reports/blob-${shard}-2.json`)).length)
        }
        if (regression) {
          assert.throws(
            () => run(['--merge-reports']),
            (error) =>
              error.status !== 0 &&
              /Coverage.*does not meet/i.test(`${error.stdout}${error.stderr}`),
          )
        } else {
          run(['--merge-reports'])
          const { total } = JSON.parse(
            readFileSync(path.join(root, 'coverage/coverage-summary.json'), 'utf8'),
          )
          for (const metric of ['lines', 'branches', 'functions', 'statements'])
            assert.equal(total[metric].pct, 100)
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
)
