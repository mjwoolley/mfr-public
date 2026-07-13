# MFR monorepo

**Always follow the change workflow in [docs/workflow.md](docs/workflow.md) for
any change to this repo** — branch first, verify locally against the `dev`
database branch, then merge to `main` (which auto-deploys to production) and
smoke-test the live site. It also covers the special rules for schema
migrations, shared packages, and environment variables.

Future features and known defects are tracked in
[docs/backlog.md](docs/backlog.md) — add new ideas/bugs there, delete items
when they ship.
