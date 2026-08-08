# MFR monorepo

**The app is feature-complete and in maintenance mode.** Default to
minimal-touch changes: fix what's asked, resist widening scope, and don't
build new automation or infrastructure unless the problem it solves has
actually occurred at least twice (the repo's history includes a staging
environment, an npm-audit gate, and a preview-URL workflow that were each
built and then retired within days — see git log). Testing and deploy-safety
machinery (coverage floors, smoke tests, auto-rollback) is mature; prefer
using it over adding to it. For dependency-bump PRs, green CI is sufficient
verification — merge without manual preview testing.

**Always follow the change workflow in [docs/workflow.md](docs/workflow.md) for
any change to this repo** — branch first, verify locally against the `dev`
database branch, then open a PR; `main` is protected and merges only with green
CI (the "CI OK" check), and merging auto-deploys to production — smoke-test the
live site afterward. The workflow doc also covers schema migrations, shared
packages, environment variables, and how to run the e2e suite.

Useful root commands: `npm run lint` / `typecheck` / `test` / `test:coverage` /
`test:coverage:unit` / `test:integration` / `test:mutation` / `format` / `e2e` /
`build`. Pre-commit hooks auto-format staged files (husky + lint-staged).
Coverage counts **every** source file (untested = 0%). The CI floors (90% on
the logic subset) are a regression backstop, **not** the target — before
finalizing any PR, deliberately verify the key business logic, flows, and
important branches (validation / authz / error / edge) are genuinely tested and
fill the gaps (see "Coverage policy & mutation testing" in the workflow doc).

**Database schema changes:** the app uses Drizzle **migrations**. After editing
`apps/mfr/lib/db/schema/*.ts`, run `npm run db:generate` **on Node 22**
(`nvm use 22`) and commit the generated migration in `apps/mfr/drizzle/` with your
code. CI's `schema-check` job blocks the PR if `schema.ts` diverges from the
committed migrations; deploys apply them automatically (`vercel-build` →
`db:migrate`). Never `drizzle-kit push --force` against a real branch. See the
"Schema changes (Drizzle migrations)" section in the workflow doc.

Future features and known defects are tracked in
[docs/backlog.md](docs/backlog.md) — add new ideas/bugs there, delete items
when they ship.
