# MFR change workflow

The standard workflow for making any change to this monorepo. `main` auto-deploys
to production (all three Vercel projects build and auto-promote on push), so the
discipline below is what stands between an edit and the family seeing it.

## The routine (every change)

1. **Branch first.** `git checkout -b fix/whatever` — keep `main` out of reach
   while work is in progress, because pushing it deploys.

2. **Develop against local + `dev` branch data.** `npm run dev:reservations`
   (or `:accounting` / `:web`) runs the app on your machine, connected to the
   `dev` branch of the Neon databases in the cloud. Production data cannot be
   touched from here.

3. **Verify before merging.** In the app(s) you changed:
   - `npm run test` — unit tests (fast, no database)
   - `npm run lint`
   - Click through the actual flow you changed in the browser — this catches
     what tests don't
   - For riskier changes: `npm run test:integration` (real queries against the
     `test` Neon branch) and `npm run build` (catches production-build-only
     errors the dev server forgives)

4. **Merge and push — that IS the deploy.** `git checkout main`, merge,
   `git push`. All three Vercel projects build and auto-promote.

5. **Smoke-test production for two minutes.** Sign in on the live site and
   exercise the flow you changed. Tests can pass while production config is
   broken; the only place to catch that class of problem is production itself.

**Rollback:** `vercel rollback` in the affected app's directory instantly
restores the previous deployment; `git revert` the commit afterward.

## Special cases

### Schema changes (accounting / Prisma)
- `npx prisma migrate dev --name whatever` locally — writes the migration file
  and applies it to the `dev` branch. Production applies it automatically
  during the deploy build (`prisma migrate deploy` runs in the build script).
- Merge the migration and its dependent code together.
- Prefer additive changes (new nullable columns, new tables) so old code keeps
  working against the new schema if a rollback is needed.
- **The `test` branch does not self-update** — run `migrate deploy` against it
  too, or integration tests will later fail on the missing column.

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
the one you were working on.

### Environment variables
- Set per-project ×3 on Vercel (`vercel env add` from the app's directory).
- Nothing takes effect until a redeploy.
- Shared values (`AUTH_SECRET`, `AUTH_COOKIE_DOMAIN`, identity DB URLs) must be
  identical across all three projects. When one app misbehaves and the others
  don't, suspect env drift first.
- When copying Neon connection strings, always pick the branch explicitly:
  `production` for Vercel env vars, `dev` for local env files. The Neon
  console and CLI default to the `dev` branch (it's the project default).

## Reference: environments

| Environment | App runs | Database (each Neon project) | Used for |
|---|---|---|---|
| Local dev | your machine (`npm run dev:*`) | `dev` branch | day-to-day development |
| Integration tests | vitest on your machine | `test` branch (via `TEST_*` env vars) | destructive schema/query tests |
| Production | Vercel (mfr_web / mfr_reservations / mfr_accounting) | `production` branch | the family |

Neon projects: `mfr-identity` (shared Auth.js tables — sessions/users),
`mfr-reservations` and `mfr-accounting` (per-app business data). Identity
production branch: `br-patient-water-ajen7oii`.

**The short mnemonic: branch → build it locally on `dev` data →
test/lint/click-through → merge & push → smoke-test production.**
