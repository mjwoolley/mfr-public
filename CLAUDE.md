# MFR monorepo

**Always follow the change workflow in [docs/workflow.md](docs/workflow.md) for
any change to this repo** — branch first, verify locally against the `dev`
database branch, then open a PR; `main` is protected and merges only with green
CI (the "CI OK" check), and merging auto-deploys to production — smoke-test the
live site afterward. The workflow doc also covers schema migrations, shared
packages, environment variables, and how to run the e2e suite.

Useful root commands: `npm run lint` / `typecheck` / `test` / `test:coverage` /
`test:coverage:unit` / `test:integration` / `test:mutation` / `format` / `e2e` /
`build`. Pre-commit hooks auto-format staged files (husky + lint-staged).
Coverage counts **every** source file (untested = 0%) and CI enforces
ratchet thresholds on the logic subset — when you add tests, bump the floors
in that workspace's `vitest.config.ts` in the same PR (see "Coverage policy &
mutation testing" in the workflow doc).

Future features and known defects are tracked in
[docs/backlog.md](docs/backlog.md) — add new ideas/bugs there, delete items
when they ship.
