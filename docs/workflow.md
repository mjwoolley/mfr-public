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
   - `npm run test:coverage:unit` — honest coverage without a database (every
     source file counts, untested ones at 0%; thresholds are skipped because
     the enforced floors assume the merged unit+integration run).
   - For riskier changes, run what CI will run anyway (fail fast locally):
     `npm run test:integration` (real queries against the `test` Neon branch)
     and `npm run build`. `npm run test:coverage` in an app runs the full
     merged unit+integration coverage with threshold enforcement — exactly
     what CI checks (needs the `TEST_*` env vars).
   - See [Coverage policy & mutation testing](#coverage-policy--mutation-testing)
     for what the thresholds mean and when to bump them.

4. **Push the branch and open a PR.** `git push -u origin fix/whatever`, then
   `gh pr create`. CI runs on the PR:

   | Job                     | What it does                                                                                                                                                            |
   | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Format, lint, typecheck | `prettier --check`, eslint, `tsc --noEmit` across all workspaces                                                                                                        |
   | Unit tests + coverage   | fast unit runs for the three apps + coverage **with ratchet thresholds** for `packages/ui` / `packages/auth`                                                            |
   | Build (×3)              | `next build` for each app with dummy DB env                                                                                                                             |
   | Integration (×3)        | Creates **ephemeral Neon branches** cloned from `production`, runs the app's merged unit+integration coverage and **enforces its ratchet thresholds**, deletes branches |
   | E2E (Playwright)        | Ephemeral branches for all 3 DBs, builds and boots all 3 apps, runs 14 browser smoke tests                                                                              |
   | Secret scan             | gitleaks over full history                                                                                                                                              |
   | Semgrep / npm audit     | Advisory only — never block a merge                                                                                                                                     |
   | **CI OK**               | The single required status check; merge is blocked until it's green                                                                                                     |

5. **Test it on staging before merging — this is the default, not an extra.**
   While CI runs on the PR, deploy the branch to staging and exercise it on the
   real deployed site:

   ```sh
   git checkout staging && git pull
   git merge fix/whatever && git push   # pushing staging IS the staging deploy
   ```

   Click through the changed flow on `staging.millerfamilyreunions.org` (and
   the reservations/accounting staging subdomains if touched). Found a problem?
   Fix on the feature branch, push (PR + CI update), merge into `staging`
   again, retest. Skip this step only for changes with no runtime surface
   (docs, comments, CI config).

6. **Merge the PR — that IS the production deploy.** Only after staging looks
   good and CI is green. All three Vercel projects build and auto-promote.

7. **Smoke-test production for two minutes.** Sign in on the live site and
   exercise the flow you changed. Tests can pass while production config is
   broken; the only place to catch that class of problem is production itself.

8. **Re-sync staging.** Merge `main → staging` and push, so staging mirrors
   what production now runs (this also flushes anything tested on staging but
   never shipped).

9. **Clean up.** GitHub deletes the remote branch automatically on merge
   (delete-branch-on-merge is enabled on the repo). Remove the local leftovers
   too: `git branch -d fix/whatever`, `git worktree remove <path>` if the work
   happened in a worktree, and `git fetch --prune`. As a safety net, a
   SessionStart hook (`scripts/check-stale-worktrees.sh`) flags any worktree or
   branch already merged into `main` at the start of each Claude session.

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

### Staging environment (test the deployed site)

An always-online copy of the whole portal, for exercising the _deployed_ site —
real URLs, real Vercel build, real OAuth — against a throwaway copy of
production data, without touching the family's real data or email.

- **Where it runs.** Three Vercel preview deployments of a long-lived `staging`
  git branch, each aliased to a staging subdomain:
  - web → `staging.millerfamilyreunions.org`
  - reservations → `reservations.staging.millerfamilyreunions.org`
  - accounting → `accounting.staging.millerfamilyreunions.org`
- **Its data.** A persistent `staging` branch in each of the three Neon projects,
  forked from `production` (so it starts with the current schema + a full copy of
  prod data). Unlike `test`, staging is never truncated by e2e. Refresh it with a
  fresh prod copy anytime: `./scripts/refresh-dev-from-prod.sh --target staging`
  (snapshots each `staging` branch to `backup-staging-<stamp>` first; production
  is only read).
- **Deploying to it.** Push (or merge) into the `staging` branch — that's the
  staging deploy, the same way merging `main` is the prod deploy. This is steps
  5 and 8 of the routine above: feature branches merge into `staging` for live
  testing before they reach `main`, and `main` merges back into `staging` after
  each release. `staging` is unprotected by design — direct pushes, no PR
  ceremony; every commit that matters gets its review on the PR to `main`.
- **Build gate.** Each project's Vercel _Ignored Build Step_ is
  `if [ "$VERCEL_ENV" == "production" ] || [ "$VERCEL_GIT_COMMIT_REF" == "staging" ]; then exit 1; else exit 0; fi`
  — it builds production and the `staging` branch, and skips every other preview
  branch (so random PR previews don't deploy). If a staging push shows up
  "Canceled" with a 0 ms build, this setting is why — confirm the branch is
  literally `staging`.
- **Privacy.** Vercel Deployment Protection was turned OFF for staging
  (2026-07-16) — it made cross-app testing painful. The staging URLs are
  publicly reachable, gated only by the apps' own Google auth + approval
  status (on prod-mirrored data). If protection is ever re-enabled, the
  web→accounting fundraising fetch breaks again — see the Trusted Sources
  chore in [backlog.md](backlog.md) for the fix.
- **Env vars (Vercel, scoped to Preview → the `staging` branch, ×3 apps).** A full
  set with staging values: the `staging` Neon DB URLs; the shared identity
  `staging` URLs and a **staging-only** `AUTH_SECRET` (identical across the three,
  never prod's); `AUTH_COOKIE_DOMAIN=.staging.millerfamilyreunions.org` and a
  distinct `AUTH_SESSION_COOKIE_NAME` (so prod's cookie — which rides along to
  every `*.millerfamilyreunions.org` subdomain — is never read as a staging
  session); staging `AUTH_URL` / `APP_BASE_URL`; the three `NEXT_PUBLIC_*_URL`
  cross-app links pointing at the staging hosts (otherwise nav bounces you back to
  prod); `ADDITIONAL_ALLOWED_ORIGINS` set to the staging host (else server actions
  are rejected). Scope these to the `staging` branch so ordinary PR previews are
  unaffected.
- **Email safety.** Leave `EMAIL_ENABLED` **unset** on staging, exactly as for dev
  — all mail is redirected to `EMAIL_OVERRIDE_TO`, never a real family address.
- **Schema changes.** Accounting (Prisma) migrates automatically on each staging
  deploy via `vercel-build`'s `prisma migrate deploy`. Reservations / identity
  (Drizzle) need the same manual `drizzle-kit push` against the `staging` branch
  that production requires — or just re-run the refresh script to re-fork the
  schema from prod.
- **OAuth / DNS / domains (one-time console setup).**
  - Google OAuth client → Authorized redirect URIs (basePath differs per app):
    `https://staging.millerfamilyreunions.org/api/auth/callback/google`,
    `https://reservations.staging.millerfamilyreunions.org/reservations/api/auth/callback/google`,
    `https://accounting.staging.millerfamilyreunions.org/accounting/api/auth/callback/google`;
    add the three hosts to Authorized JavaScript origins too.
  - Vercel: assign each staging subdomain to the project's `staging` branch
    (Project → Settings → Domains → add domain → Git branch `staging`).
  - DNS: point `staging`, `reservations.staging`, `accounting.staging`
    (under millerfamilyreunions.org) at Vercel per its instructions.

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

## Coverage policy & mutation testing

### Honest coverage

Every vitest config sets explicit `coverage.include` globs, so **all source
files count toward coverage — untested files show up at 0%** instead of being
invisible (vitest's default only counts files a test happens to import).
`test:coverage` in the three apps runs the unit **and** integration projects
in one go and reports one merged number (this is what CI enforces; it needs
the `TEST_*` env vars). `test:coverage:unit` is the no-database variant for
quick local runs; it skips thresholds since unit-only numbers sit below the
merged floors. Reports: terminal table + `coverage/index.html` per workspace.

### The ratchet

Coverage thresholds live in each workspace's `vitest.config.ts` and are a
**floor, not a target**: they started at the measured baseline (2026-07-16)
and only move up. CI fails any PR that drops below them.

- Thresholds apply only to the **logic subset**: `lib/`, API route handlers,
  server actions, emails, and all of `packages/ui` / `packages/auth`.
  Pages/layouts/client components are _measured and reported_ but not
  thresholded — the e2e suite is responsible for those.
- **When you add tests, bump the relevant thresholds in the same PR** (round
  down to whole numbers, leave a couple points of slack below the new
  measured value). The long-term target is **90%** on the logic subset.
- If a refactor legitimately lowers a percentage (e.g. deleting well-covered
  code), either add a test or lower the floor in the same PR and say why in
  the PR description.

### Mutation testing (StrykerJS)

Mutation testing measures whether the tests would actually _fail_ if the
logic changed — a much stronger signal than line coverage. It is
**report-only** and never gates a merge.

- `npm run test:mutation -w <workspace>` — run locally for reservations,
  accounting, web, or `packages/auth`. Repeat runs are fast thanks to
  Stryker's incremental file (`reports/stryker-incremental.json`).
- The apps use `vitest.stryker.config.ts` (flat, unit-only) so mutation runs
  never touch a database.
- The **`mutation.yml` workflow** runs the full sweep weekly (Mondays 06:00
  UTC, or `gh workflow run mutation.yml`): scores land in the job summary,
  browsable HTML reports in the artifacts.
- Low scores mostly mean _uncovered code_ (`NoCoverage` mutants) — the same
  gap the coverage ratchet tracks. `Survived` mutants on covered code are
  the interesting ones: they point at weak assertions.
- Baseline scores 2026-07-16: reservations 40.7%, accounting 26.6%,
  web 10.4%, auth 33.1%.

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
# Build with CI-style dummy env — apps/web fails page-data collection without
# IDENTITY_DATABASE_URL, and NEXT_PUBLIC_HOME_URL must point at the e2e portal
# (mirror the "Build apps" env in .github/workflows/ci.yml):
DATABASE_URL=postgres://ci:ci@localhost:5432/ci \
DIRECT_URL=postgres://ci:ci@localhost:5432/ci \
IDENTITY_DATABASE_URL=postgres://ci:ci@localhost:5432/ci \
PORTAL_DATABASE_URL=postgres://ci:ci@localhost:5432/ci \
AUTH_SECRET=ci-dummy-secret-not-used \
NEXT_PUBLIC_HOME_URL=http://localhost:3100 \
npm run build                    # e2e serves the apps with `next start`

export E2E_IDENTITY_DATABASE_URL=...        # pooled …
export E2E_IDENTITY_DIRECT_URL=...          # … and direct URLs for the
export E2E_PORTAL_DATABASE_URL=...          # `test` branch of each of the
export E2E_PORTAL_DIRECT_URL=...            # FOUR Neon projects (identity,
export E2E_ACCOUNTING_DATABASE_URL=...      # portal, accounting,
export E2E_ACCOUNTING_DIRECT_URL=...        # reservations).
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
| Staging           | Vercel preview of the `staging` branch (×3 apps)     | `staging` branch (copy of production)   | testing the deployed site      |
| Production        | Vercel (mfr_web / mfr_reservations / mfr_accounting) | `production` branch                     | the family                     |

Neon projects: `mfr-identity` (shared Auth.js tables — sessions/users),
`mfr-reservations` and `mfr-accounting` (per-app business data). Identity
production branch: `br-patient-water-ajen7oii`.

**The short mnemonic: branch → build it locally on `dev` data →
test/lint/click-through → PR → push to `staging` and test the deployed site →
CI green + staging good → merge → smoke-test production → re-sync staging →
clean up the branch and worktree.**
