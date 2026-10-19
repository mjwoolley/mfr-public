# MFR change workflow

The standard workflow for making any change to this monorepo. `main` auto-deploys
to production (the `mfr_web` Vercel project builds and auto-promotes on push), and
`main` is protected: changes land through a pull request whose CI must be green
before merging. CI plus the discipline below is what stands between an edit and
the family seeing it.

## The routine (every change)

1. **Branch first.** `git checkout -b fix/whatever`. Direct pushes to `main`
   are rejected by branch protection (even for admins).

2. **Develop against local + `dev` branch data.** `npm run dev` runs the app on
   your machine (localhost:3000), connected to the `dev` branch of the `mfr`
   Neon project in the cloud. Production data cannot be
   touched from here.

3. **Verify locally.**
   - `npm run test` — unit tests (fast, no database)
   - `npm run lint` and `npm run typecheck`
   - Click through the actual flow you changed in the browser — this catches
     what tests don't
   - Formatting is automatic: the pre-commit hook (husky + lint-staged) runs
     prettier and `eslint --fix` on staged files. `npm run format` fixes the
     whole repo manually.
   - `npm run test:coverage:unit` — honest coverage without a database (every
     source file counts, untested ones at 0%; thresholds are skipped because
     the enforced floors assume the merged unit+integration run).
   - For riskier changes, run what CI will run anyway (fail fast locally):
     `npm run test:integration` (real queries against the `test` Neon branch)
     and `npm run build`. `npm run test:coverage` in `apps/mfr` runs the full
     merged unit+integration coverage with threshold enforcement — exactly
     what CI checks (needs the `TEST_*` env vars).
   - See [Coverage policy & mutation testing](#coverage-policy--mutation-testing)
     for what the thresholds mean (they're a backstop, not a target).

4. **Before opening the PR, revisit coverage deliberately — the number is a
   backstop, not the goal.** The CI floors (90% on the logic subset) only catch
   gross regressions. Confirm that every piece of key business logic, every
   user/admin flow, and every important branch — validation, authorization,
   error, and edge paths — is actually exercised by a test, and add the ones
   that aren't. A passing threshold over an untested money-path or auth gate is
   a gap, not a green light.

5. **Push the branch and open a PR.** `git push -u origin fix/whatever`, then
   `gh pr create`. CI runs on the PR:

   | Job                     | What it does                                                                                                                                                                                                                                |
   | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Format, lint, typecheck | `prettier --check`, eslint, `tsc --noEmit` across all workspaces                                                                                                                                                                            |
   | Unit tests + coverage   | fast unit runs for `apps/mfr` + coverage **with ratchet thresholds** for `packages/ui` / `packages/auth`                                                                                                                                    |
   | Schema migration check  | Re-runs `db:generate` and fails if `schema.ts` has changes with no committed migration                                                                                                                                                      |
   | Build                   | `next build` for `apps/mfr` with dummy DB env                                                                                                                                                                                               |
   | Integration             | Creates **one ephemeral Neon branch** from `production`, migrates it, copies its app database into two isolated databases, runs two parallel unit+integration shards, then merges coverage and **enforces the original ratchet thresholds** |
   | E2E (Playwright)        | Its own ephemeral branch; builds and boots the app, runs the browser suite (smoke + lifecycle/flows/auth/admin specs), single worker                                                                                                        |
   | Secret scan             | gitleaks over full history                                                                                                                                                                                                                  |
   | Semgrep                 | Advisory only — never blocks a merge                                                                                                                                                                                                        |
   | **CI OK**               | The single required status check; merge is blocked until it's green                                                                                                                                                                         |

6. **Test it on the PR's own preview before merging — this is the default, not
   an extra.** Every PR gets its own Vercel preview URL, backed by its **own**
   Neon branch forked from `production` (real data, isolated — a preview can't
   touch prod). Vercel posts the preview link on the PR as soon as the build
   finishes; open it and exercise the flow you changed on the real deployed site
   (real URL, real Vercel build, real Google OAuth through the prod redirect
   proxy). Found a problem? Fix on the feature branch and push — the preview
   redeploys automatically. Skip this step only for changes with no runtime
   surface (docs, comments, CI config). See
   [preview-deploys.md](preview-deploys.md) for how previews are wired.

7. **Merge the PR — that IS the production deploy.** Only after the preview looks
   good and CI is green. The Vercel project builds and auto-promotes. **Use "Create a
   merge commit" — never squash or rebase-merge.** A merge commit keeps each branch's
   real commits in `main`'s history, so `git log`, `git bisect`, and `git branch --merged`
   all stay honest; squashing flattens the branch into one commit and orphans the
   originals (which is why step 9's `git branch -d` works cleanly here).

8. **Smoke-test production for two minutes.** Sign in on the live site and
   exercise the flow you changed. Tests can pass while production config is
   broken; the only place to catch that class of problem is production itself.

9. **Clean up.** GitHub deletes the remote branch automatically on merge
   (delete-branch-on-merge is enabled on the repo). Remove the local leftovers
   too: `git branch -d fix/whatever`, `git worktree remove <path>` if the work
   happened in a worktree, and `git fetch --prune`. As a safety net, a
   SessionStart hook (`scripts/check-stale-worktrees.sh`) flags any worktree or
   branch already merged into `main` at the start of each Claude session.
   (The PR's preview and its Neon branch are torn down automatically when the PR
   is merged or closed — nothing to clean up by hand.)

**Rollback:** `vercel rollback` (project `mfr_web`) instantly
restores the previous deployment; `git revert` the commit afterward (via a PR).
A **critical** production smoke failure (user-facing site broken,
smoke exit code 1) now does this automatically — `production-smoke.yml` rolls
the prod alias back, opens a `revert/<sha>` PR, and files a `prod-smoke-failure`
issue. A _degraded_ failure (exit code 3 — a probe/config check like
`CRON_SECRET`, site still up) only files the issue; no rollback.

## Special cases

### Schema changes (Drizzle migrations)

The whole app is one Drizzle schema (`apps/mfr/lib/db/schema/`). Schema changes
ship as **committed migration files** that deploys apply automatically.

1. Edit `lib/db/schema/*.ts`, then **`npm run db:generate` on Node 22**
   (`nvm use 22` — matches `.nvmrc`; generating on Node 24 also drifts the
   lockfile). This writes a migration under `apps/mfr/drizzle/` and updates the
   snapshot in `drizzle/meta/`.
2. **Commit the migration with the code that needs it.** CI's `schema-check` job
   re-runs `db:generate` and **fails the PR** (blocking `ci-ok`) if `schema.ts`
   diverges from the committed migrations — so you can't forget it.
3. Deploys apply schema themselves: the Vercel build runs `vercel-build`
   (`node scripts/migrate-deploy.mjs && next build`), which runs the drizzle-orm
   migrator (forward-only — safe, unlike `drizzle-kit push`) then re-applies
   `lib/db/push-only.sql` (the GiST EXCLUDE / `booking_rules` CHECK / blocked-date
   triggers drizzle-kit can't emit). Plain `npm run build` still never touches a DB.
4. CI's integration/e2e jobs fork an ephemeral branch from `production` and run
   the same `npm run db:migrate`, so pending migrations are exercised before merge.

Notes:

- Prefer additive changes (new nullable columns/tables) so old code still works
  against the new schema during a rollback window.
- **Never `drizzle-kit push --force`** against a real branch — it drops the
  push-only objects. Use migrations (or targeted DDL) instead.
- The migration journal was baselined 2026-07-18: `0000` is recorded as applied
  on the dev/test/production Neon branches (they already had the tables),
  so `migrate` no-ops there and only applies genuinely new migrations.

### Refreshing dev with production data

The `dev` branch of the `mfr` Neon project is a child of `production`. To give
local dev a fresh copy of real data, delete `dev` and re-create it from
`production` (Neon console or `neon branches create --name dev --parent production`), then
update `DATABASE_URL` / `DIRECT_URL` in `apps/mfr/.env.local` with the new
branch's connection strings. Production is only read. This **discards** any
local-only data you'd set up in dev. (`scripts/refresh-dev-from-prod.sh` is
obsolete — it targets the pre-merge Neon projects, which no longer exist.)

Because dev then holds real family emails, `sendEmail` never delivers to real recipients outside production: only prod sets
`EMAIL_ENABLED=true`; everywhere else mail is redirected to `EMAIL_OVERRIDE_TO`
(or dropped). Keep `EMAIL_ENABLED` unset in every local/dev env.

### Preview deployments (test the deployed site)

Every PR gets its own Vercel preview of the whole portal, for exercising the
_deployed_ site — real URL, real Vercel build, real OAuth — against an isolated
copy of production data, without touching the family's real data or email. This
replaces the old always-on `staging` environment: previews are per-PR and
disposable, so PRs no longer queue through a single shared slot.

- **Where it runs.** A Vercel preview deployment of the PR's branch on the
  `mfr_web` project, on a `*.vercel.app` URL that Vercel posts to the PR.
- **Its data.** The Neon–Vercel integration forks a fresh Neon branch from
  `production` for each preview (current schema + a full copy of prod data,
  isolated from prod). Neon auto-deletes the branch when the PR's preview is
  removed (merge or close).
- **Deploying to it.** Just push the PR branch — Vercel builds a preview on every
  push. This is step 6 of the routine above. No force-push, no shared branch, no
  ceremony; every commit that matters still gets its review on the PR to `main`.
- **Auth.** Previews sign in through the **prod redirect proxy**: Google's
  callback lands on prod (`AUTH_REDIRECT_PROXY_URL`), which forwards back to the
  preview origin. Previews reuse prod's `AUTH_SECRET` + Google client (so Google
  needs no per-preview redirect URIs) and set `AUTH_TRUST_HOST=true` so Auth.js
  derives each preview's own origin. Details + the exact env in
  [preview-deploys.md](preview-deploys.md).
- **Email safety.** `EMAIL_ENABLED` is left **unset** on previews, exactly as for
  dev — all mail is redirected to `EMAIL_OVERRIDE_TO`, never a real family
  address.
- **Schema changes.** Migrations apply automatically on each preview deploy via
  `vercel-build` → `db:migrate` (drizzle-orm migrator + `push-only.sql`), the same
  as production — nothing manual. The forked Neon branch already carries prod's
  current schema.

### Shared packages (`packages/ui`, `packages/auth`)

`apps/mfr` is their only consumer, so verify a package change the same way as
an app change — run the package's own tests plus the app's, and click through
the affected screens.

### Environment variables

- Set on the `mfr_web` Vercel project (`vercel env add`), scoped to
  Production and/or Preview.
- Nothing takes effect until a redeploy.
- `AUTH_SECRET` must be identical on Production and Preview — previews sign in
  through the prod redirect proxy, which decrypts their OAuth state with it.
- When copying Neon connection strings, always pick the branch explicitly:
  `production` for Vercel env vars, `dev` for local env files.
- Member Feedback's Jira and reply variables are Production-only; see
  [member-feedback.md](member-feedback.md).

## Coverage policy & mutation testing

### Honest coverage

Every vitest config sets explicit `coverage.include` globs, so **all source
files count toward coverage — untested files show up at 0%** instead of being
invisible (vitest's default only counts files a test happens to import).
`test:coverage` in `apps/mfr` runs the unit **and** integration projects
in one go and reports one merged number (this is what CI enforces; it needs
the `TEST_*` env vars). `test:coverage:unit` is the no-database variant for
quick local runs; it skips thresholds since unit-only numbers sit below the
merged floors. Reports: terminal table + `coverage/index.html` per workspace.

### The floors are a backstop, not a target

Coverage thresholds live in each workspace's `vitest.config.ts`. They are a
**regression backstop — not a goal to chase toward 100%.** CI fails any PR that
drops below them; that catches gross regressions. What actually keeps the suite
honest is the deliberate pre-PR coverage review (step 4 of the routine), not the
number.

- Floors are capped at **90%** (lines/statements/functions) and **85%**
  (branches — defensive/unreachable arms make a higher branch floor brittle).
  Don't crank a floor above the cap to "lock in" a high measurement; a green
  90% with an untested flow is still a gap. A few globs sit below the cap on
  purpose (documented in-config: reservations routes' defensive 500 fallbacks;
  emails' v8-merge measurement flake) — leave those at their honest-measured
  floor rather than forcing filler tests.
- Thresholds apply only to the **logic subset**: `lib/`, API route handlers,
  server actions, emails, and all of `packages/ui` / `packages/auth`.
  Pages/layouts/client components are _measured and reported_ but not
  thresholded — the e2e suite is responsible for those.
- If a refactor legitimately lowers a percentage (e.g. deleting well-covered
  code), either add a test or lower the floor in the same PR and say why in
  the PR description. Only raise a floor when you've genuinely closed a real
  coverage gap and want to hold the line — never just to pin a lucky number.

### Mutation testing (StrykerJS)

Mutation testing measures whether the tests would actually _fail_ if the
logic changed — a much stronger signal than line coverage. It is
**report-only** and never gates a merge.

- `npm run test:mutation -w <workspace>` — a full run, for `apps/mfr` or
  `packages/auth`. Use `test:mutation:incremental` instead to make repeat
  local runs fast via Stryker's incremental file
  (`reports/stryker-incremental.json`). Incremental is opt-in **on the CLI
  only**: `--incremental` is a valueless flag with no off switch, so config
  must never default it on or CI could never ask for a full run.
- The apps use `vitest.stryker.config.ts` (flat, unit-only) so mutation runs
  never touch a database.
- The **`mutation.yml` workflow** runs the full sweep weekly (Mondays 06:00
  UTC, or `gh workflow run mutation.yml`): scores land in the job summary,
  browsable HTML reports in the artifacts.
- **Read the `covered` column, not `total`.** Because Stryker sees only the
  unit tests, everything covered _exclusively_ by an integration suite counts
  as `NoCoverage` and drags `total` down — e.g. all four `app/**/actions.ts`
  score 0% here while line coverage has them at 100%. `Survived` mutants on
  covered code are the interesting ones: they point at weak assertions.
- Keep the `mutate` globs in `stryker.config.json` in sync when files move.
  Stryker warns (`Glob pattern "…" did not exclude any files`) but exits 0, so
  a stale negative glob silently pollutes the score — a dead
  `!lib/db/schema.ts` left the Drizzle table definitions under mutation and
  cost ~6.5 points plus 12 minutes of runtime until 2026-08-07.
- Baseline scores 2026-08-07: mfr 55.4% total / 83.0% covered,
  auth 89.8%. Weakest genuinely-unit-tested files: `portalStatusGate.ts` 20%,
  `lib/accounting/authz.ts` 63.6%, `lib/photos/backupStore.ts` 63.3%,
  `lib/drive/client.ts` 72.3% (52 survivors).

## E2E tests (Playwright)

Sessions are Auth.js **database sessions**, so the e2e suite signs in by
seeding rows, not by clicking through Google OAuth: `e2e/global-setup.ts`
truncates the e2e databases and inserts fixed personas (member / admin /
pending / outsider) plus matching `sessions` rows, and each test attaches the
`authjs.session-token` cookie for its persona. **There is no test-login code
path in the app** — nothing to guard, nothing that can ship to production.
(A guarded Credentials provider was rejected: Auth.js forces JWT sessions for
credentials sign-ins, conflicting with the database-session architecture.)

Run locally:

```sh
# Build with CI-style dummy env (mirror the "Build apps/mfr" env in
# .github/workflows/ci.yml); the real branch URL is injected at runtime by
# playwright.config.ts's webServer entry:
DATABASE_URL=postgres://ci:ci@localhost:5432/ci \
DIRECT_URL=postgres://ci:ci@localhost:5432/ci \
AUTH_SECRET=ci-dummy-secret-not-used \
npm run build -w apps/mfr         # e2e serves the app with `next start`

export E2E_DATABASE_URL=...       # pooled URL for the unified `test` Neon branch
export E2E_DIRECT_URL=...         # direct URL (global-setup truncates + seeds it —
                                  # NEVER production).
npm run e2e
```

In CI the E2E job provisions its own ephemeral branches; no setup needed.

## CI secrets (GitHub repo settings)

`NEON_API_KEY` — an org API key created in the Neon console. A daily
`cleanup-neon.yml` workflow deletes any `ci-*` branch older than 24h that a
crashed runner leaked, in the unified `mfr` project (`lucky-butterfly-29223414`,
inlined there and in `ci.yml`; project ids aren't secrets). The old per-domain
`NEON_PROJECT_ID_ACCOUNTING` / `_RESERVATIONS` / `_IDENTITY` secrets are
obsolete — those projects were consolidated into `mfr` and deleted.

## Reference: environments

| Environment       | App runs                                | Database (each Neon project)            | Used for                       |
| ----------------- | --------------------------------------- | --------------------------------------- | ------------------------------ |
| Local dev         | your machine (`npm run dev`)            | `dev` branch                            | day-to-day development         |
| Integration tests | vitest on your machine                  | `test` branch (via `TEST_*` env vars)   | destructive schema/query tests |
| Local e2e         | `next start` via Playwright             | `test` branch (via `E2E_*` env vars)    | full browser suite             |
| CI                | GitHub Actions (PRs + pushes to `main`) | ephemeral `ci-*` branches, auto-deleted | the merge gate                 |
| Preview           | Vercel preview of the PR branch         | per-PR Neon branch forked from prod     | testing the deployed site      |
| Production        | Vercel (`mfr_web`)                      | `production` branch                     | the family                     |

All branches are in the one Neon project, `mfr` (`lucky-butterfly-29223414`).

**The short mnemonic: branch → build it locally on `dev` data →
test/lint/click-through → PR → open the PR's preview and test the deployed site →
CI green + preview good → merge → smoke-test production → clean up the branch and
worktree.**
