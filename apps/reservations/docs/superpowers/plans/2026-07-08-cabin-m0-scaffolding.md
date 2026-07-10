# Cabin Reservations — M0: Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Next.js project skeleton (TypeScript, App Router, Tailwind, testing tooling) and add the structured technical logger, so every later milestone has a working `npm run dev` / `npm run build` / `npm test` baseline to build on.

**Architecture:** Standard Next.js 15 App Router project created via `create-next-app`, customized with Vitest for testing and a `pino`-based structured logger module used by all future API routes. No database, auth, or business logic in this milestone — purely scaffolding.

**Tech Stack:** Next.js 15, React 19, TypeScript (strict), Tailwind CSS, Vitest, pino.

## Global Constraints

- Package manager: npm (use `npm`/`npx` for all commands in this and all later plans, for consistency).
- TypeScript strict mode must be enabled (`"strict": true` in `tsconfig.json` — this is `create-next-app`'s default when you answer "Yes" to the TypeScript prompt, verify it's not overridden).
- Node.js runtime target: the project must run on Vercel's Node.js serverless functions (not Edge) for API routes, per the overall project design — no code in this milestone should assume Edge runtime.
- The `lib/logger.ts` module must never be imported by client components — it is server-only (Node `pino`, not browser-safe).

---

### Task 1: Scaffold Next.js project

**Files:**
- Create: entire Next.js project skeleton via `create-next-app` (package.json, tsconfig.json, next.config.ts, tailwind config, app/layout.tsx, app/page.tsx, app/globals.css, .eslintrc/eslint.config, .gitignore)
- Modify: `.gitignore` (add `.superpowers/` if not already covered by an existing ignore rule)

**Interfaces:**
- Consumes: nothing (first task in the project)
- Produces: a working Next.js App Router project at the repo root, runnable via `npm run dev` and buildable via `npm run build`. Later tasks add `app/(public)`, `app/(app)`, `app/api` route groups inside the existing `app/` directory created here.

- [ ] **Step 1: Run create-next-app**

From the repo root (the worktree root — the directory containing `.git`), run:

```bash
npx --yes create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm --skip-install=false
```

When prompted (if the flags don't suppress prompts in your version), answer: TypeScript Yes, ESLint Yes, Tailwind CSS Yes, `src/` directory No, App Router Yes, import alias `@/*` Yes.

If the command fails because the directory is non-empty (it will contain `.git` and possibly `docs/`), that's expected and fine — `create-next-app` supports scaffolding into a non-empty directory that only contains dotfiles/a `.git` folder; if it refuses, re-run with `--force` (safe here since there is no existing app code to overwrite, only `.git` and the `docs/` folder from planning).

**Step 2: Verify the dev server boots**

Run: `npm run build`
Expected: build completes with exit code 0, no TypeScript errors.

**Step 3: Confirm `.gitignore` covers worktree/tooling scratch dirs**

Open `.gitignore` (created by `create-next-app`) and confirm it includes `node_modules`, `.next`, `.env*.local`. Add a line for `.superpowers/` if it is not already present (this directory holds subagent-driven-development's local progress ledger and scratch files and must never be committed):

```
.superpowers/
```

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project (TypeScript, Tailwind, App Router)"
```

---

### Task 2: Structured technical logger

**Files:**
- Create: `lib/logger.ts`
- Create: `lib/logger.test.ts`
- Modify: `package.json` (add `pino` dependency, add `test` script)
- Create: `vitest.config.ts`

**Interfaces:**
- Consumes: nothing new (standalone module)
- Produces: `export const logger: pino.Logger` from `lib/logger.ts`, importable as `import { logger } from '@/lib/logger'`. Later milestones' API routes call `logger.info({...}, 'message')` / `logger.error({...}, 'message')`. This is the only produced interface later tasks depend on — keep the export name and shape (`pino.Logger` instance, not a wrapper class) stable.

- [ ] **Step 1: Install dependencies**

```bash
npm install pino
npm install -D vitest @vitejs/plugin-react vite-tsconfig-paths
```

- [ ] **Step 2: Write `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Add test script to `package.json`**

In the `"scripts"` section of `package.json`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write the failing test**

Create `lib/logger.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger } from './logger'

describe('logger', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
  })

  it('emits a single line of valid JSON containing the message and custom fields', () => {
    logger.info({ userId: 'abc123' }, 'test event')

    expect(stdoutSpy).toHaveBeenCalledTimes(1)
    const written = stdoutSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(written.trim())

    expect(parsed.msg).toBe('test event')
    expect(parsed.userId).toBe('abc123')
    expect(typeof parsed.level).not.toBe('undefined')
    expect(typeof parsed.time).not.toBe('undefined')
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `lib/logger.ts` does not exist yet (module not found).

- [ ] **Step 6: Write minimal implementation**

Create `lib/logger.ts`:

```typescript
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
})
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 1 test passing.

- [ ] **Step 8: Commit**

```bash
git add lib/logger.ts lib/logger.test.ts vitest.config.ts package.json package-lock.json
git commit -m "feat: add structured pino logger for technical/operational logging"
```

---

### Task 3: Environment variable template

**Files:**
- Create: `.env.example`

**Interfaces:**
- Consumes: nothing
- Produces: documented list of every environment variable later milestones will read via `process.env.*`. This file is documentation only (not loaded at runtime) — later tasks that read a new `process.env.X` must add `X` here in their own task, but the initial known set is created now.

- [ ] **Step 1: Write `.env.example`**

```bash
# Auth.js / Google OAuth (Milestone 2)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
AUTH_SECRET=

# Database — Neon Postgres pooled connection string (Milestone 1)
DATABASE_URL=

# Email — Resend (Milestone 8)
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Cron authentication (Milestone 8)
CRON_SECRET=

# Technical logging (optional, defaults to "info")
LOG_LEVEL=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add .env.example template"
```

## Self-Review Notes

- Spec coverage: M0 from the approved implementation plan covers scaffolding + `.env.example` + `lib/logger.ts` — all three are tasked above.
- No placeholders: all steps have literal commands/code.
- Type consistency: `logger` export name and `pino.Logger` shape is the only interface surfaced to later tasks; consistent throughout.
