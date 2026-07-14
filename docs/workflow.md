# MFR change workflow

The standard workflow for making any change to this monorepo. `main` auto-deploys
to production (all three Vercel projects build and auto-promote on push), and
`main` is protected: changes land through a pull request whose CI must be green
before merging. CI plus the discipline below is what stands between an edit and
the family seeing it.

## The routine (every change)

1. **Branch first.** `git checkout -b fix/whatever`. Direct pushes to `main`
   are rejected by branch protection (even for admins).

2. **Develop against local + `dev` branch data.** `npm run dev:reservations`
   (or `:accounting` / `:web`) runs the app on your machine, connected to the
   `dev` branch of the Neon databases in the cloud. Production data cannot be
   touched from here.

3. **Verify locally.** In the app(s) you changed:
   - `npm run test` — unit tests (fast, no database)
   - `npm run lint` and `npm run typecheck`
   - Click through the actual flow you changed in the browser — this catches
     what tests don't
   - Formatting is automatic: the pre-commit hook (husky + lint-staged) runs
     prettier and `eslint --fix` on staged files. `npm run format` fixes the
     whole repo manually.
   - For riskier changes, run what CI will run anyway (fail fast locally):
     `npm run test:integration` (real queries against the `test` Neon branch)
     and `npm run build`.

4. **Push the branch and open a PR.** `git push -u origin fix/whatever`, then
   `gh pr create`. CI runs on the PR:

   | Job                     | What it does                                                                                                                                                             |
   | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | Format, lint, typecheck | `prettier --check`, eslint, `tsc --noEmit` across all workspaces                                                                                                         |
   | Unit tests + coverage   | vitest in every workspace; coverage table in the job summary (report-only, no thresholds)                                                                                |
   | Build (×3)              | `next build` for each app with dummy DB env                                                                                                                              |
   | Integration (×2)        | Creates **ephemeral Neon branches** cloned from `production` (own identity branch each), runs the suite, deletes branches (accounting also runs `prisma migrate deploy`) |
   | E2E (Playwright)        | Ephemeral branches for all 3 DBs, builds and boots all 3 apps, runs 14 browser smoke tests                                                                               |
   | Secret scan             | gitleaks over full history                                                                                                                                               |
   | Semgrep / npm audit     | Advisory only — never block a merge                                                                                                                                      |
   | **CI OK**               | The single required status check; merge is blocked until it's green                                                                                                      |

5. **Merge the PR — that IS the deploy.** All three Vercel projects build and
   auto-promote.

6. **Smoke-test production for two minutes.** Sign in on the live site and
   exercise the flow you changed. Tests can pass while production config is
   broken; the only place to catch that class of problem is production itself.

**Rollback:** `vercel rollback` in the affected app's directory instantly
restores the previous deployment; `git revert` the commit afterward (via a PR).

## Special cases

### Schema changes (accounting / Prisma)

- `npx prisma migrate dev --name whatever` locally — writes the migration file
  and applies it to the `dev` branch.
- Production applies migrations during the deploy build: Vercel runs the
  `vercel-build` script (`prisma generate && prisma migrate deploy && next build`).
  Plain `npm run build` deliberately does **not** migrate, so CI and local
  builds never touch a database.
- Merge the migration and its dependent code together.
- Prefer additive changes (new nullable columns, new tables) so old code keeps
  working against the new schema if a rollback is needed.
- CI's ephemeral branches are cloned from `production`, so they already carry
  the current schema. The accounting job additionally runs `prisma migrate
deploy` (a clean no-op unless the PR adds a migration, since production's
  Prisma journal is reliable). **The long-lived `test` branch still does not
  self-update** — for _local_ integration runs, apply `migrate deploy` against
  it after adding accounting migrations.

### Schema changes (reservations / identity — Drizzle)

- These schemas were set up with `drizzle-kit push`, so their production
  branches carry no usable migration journal (`drizzle-kit migrate` would
  replay every file and collide). CI therefore runs **no** Drizzle step — the
  production-clone branch already has the full schema, including the
  migration-only constraints (the `booking_rules` id=1 CHECK, the reservations
  GIST overlap exclusion) that `drizzle-kit push` would strip.
- Consequence: a Drizzle schema change is only reflected in CI once it's on the
  production branch. Apply `drizzle-kit push`/`migrate` to production (and the
  `test` branch for local runs) as part of shipping the change.

### Refreshing dev with production data

When you want local dev to run against a fresh copy of real data, run
`./scripts/refresh-dev-from-prod.sh` (needs `NEON_API_KEY` and a PG17+
`pg_dump`/`pg_restore` — see the script header). It snapshots each `dev` branch
to `backup-dev-<timestamp>`, then replaces its contents with a dump of
`production`. Production is only read; the dev branch IDs don't change, so local
`.env` files keep working. Note this **overwrites** any local-only data you'd
set up in dev.

Because dev then holds real family emails, the accounting app's `sendEmail`
never delivers to real recipients outside production: only prod sets
`EMAIL_ENABLED=true`; everywhere else mail is redirected to `EMAIL_OVERRIDE_TO`
(or dropped). Keep `EMAIL_ENABLED` unset in every local/dev env.

### Shared packages (`packages/ui`, `packages/auth`)

A change there ships to all three apps at once — verify all three, not just
the one you were working on. (CI builds and e2e-tests all three on every PR.)

### Environment variables

- Set per-project ×3 on Vercel (`vercel env add` from the app's directory).
- Nothing takes effect until a redeploy.
- Shared values (`AUTH_SECRET`, `AUTH_COOKIE_DOMAIN`, identity DB URLs) must be
  identical across all three projects. When one app misbehaves and the others
  don't, suspect env drift first.
- When copying Neon connection strings, always pick the branch explicitly:
  `production` for Vercel env vars, `dev` for local env files. The Neon
  console and CLI default to the `dev` branch (it's the project default).

## E2E tests (Playwright)

Sessions are Auth.js **database sessions**, so the e2e suite signs in by
seeding rows, not by clicking through Google OAuth: `e2e/global-setup.ts`
truncates the e2e databases and inserts fixed personas (member / admin /
pending / outsider) plus matching `sessions` rows, and each test attaches the
`authjs.session-token` cookie for its persona. **There is no test-login code
path in any app** — nothing to guard, nothing that can ship to production.
(A guarded Credentials provider was rejected: Auth.js forces JWT sessions for
credentials sign-ins, conflicting with the database-session architecture.)

Run locally:

```sh
npm run build                    # e2e serves the apps with `next start`
export E2E_IDENTITY_DATABASE_URL=...        # pooled …
export E2E_IDENTITY_DIRECT_URL=...          # … and direct URLs for the
export E2E_ACCOUNTING_DATABASE_URL=...      # `test` branch of each of the
export E2E_ACCOUNTING_DIRECT_URL=...        # three Neon projects.
export E2E_RESERVATIONS_DATABASE_URL=...    # NEVER production — global-setup
export E2E_RESERVATIONS_DIRECT_URL=...      # truncates these databases.
npm run e2e
```

In CI the E2E job provisions its own ephemeral branches; no setup needed.

## CI secrets (GitHub repo settings)

`NEON_PROJECT_ID_ACCOUNTING`, `NEON_PROJECT_ID_RESERVATIONS`,
`NEON_PROJECT_ID_IDENTITY` (set), and `NEON_API_KEY` — an org API key created
in the Neon console. A daily `cleanup-neon.yml` workflow deletes any `ci-*`
branch older than 24h that a crashed runner leaked.

## Reference: environments

| Environment       | App runs                                             | Database (each Neon project)            | Used for                       |
| ----------------- | ---------------------------------------------------- | --------------------------------------- | ------------------------------ |
| Local dev         | your machine (`npm run dev:*`)                       | `dev` branch                            | day-to-day development         |
| Integration tests | vitest on your machine                               | `test` branch (via `TEST_*` env vars)   | destructive schema/query tests |
| Local e2e         | `next start` ×3 via Playwright                       | `test` branch (via `E2E_*` env vars)    | browser smoke tests            |
| CI                | GitHub Actions (PRs + pushes to `main`)              | ephemeral `ci-*` branches, auto-deleted | the merge gate                 |
| Production        | Vercel (mfr_web / mfr_reservations / mfr_accounting) | `production` branch                     | the family                     |

Neon projects: `mfr-identity` (shared Auth.js tables — sessions/users),
`mfr-reservations` and `mfr-accounting` (per-app business data). Identity
production branch: `br-patient-water-ajen7oii`.

**The short mnemonic: branch → build it locally on `dev` data →
test/lint/click-through → PR → CI green → merge → smoke-test production.**
