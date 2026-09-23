# mfr

Monorepo for the **Miller Family Reunions portal** (millerfamilyreunions.org) — the
family's lake house on Lake Lure, NC, run as a small corporation. One Next.js app
(portal, reservations, and accounting as sections of the same site), one
database, one Google sign-in.

## Structure

```
apps/
  mfr/            the whole site: public home, photos, meals, documents,
                  sign-in, admin (content + user approval & roles),
                  /reservations (cabin booking), /accounting (shareholder ledger)
packages/
  auth/           @mfr/auth — shared Auth.js config factory, identity schema,
                  and the portal-roles model the app authorizes against
  ui/             @mfr/ui — shared "Organic" design-system components + CSS
e2e/              Playwright browser tests
scripts/          operational scripts (smoke tests, seeding the smoke user)
docs/             workflow.md (THE change workflow — read it first), backlog.md
```

The app deploys to Vercel as the `mfr_web` project (Root Directory `apps/mfr`).
Shared packages are consumed as raw TypeScript via `transpilePackages` — no
build step.

## Architecture in one minute

- **One Neon Postgres project (`mfr`)** holding every table — identity
  (Auth.js users/sessions), portal content + roles, reservations, and
  accounting — managed by one Drizzle schema in `apps/mfr/lib/db/schema/` with
  committed migrations that deploys apply automatically. Business tables store
  `users.id` as a plain value (no cross-domain foreign keys).
- **One login**: a single NextAuth instance at `/api/auth`, built from
  `@mfr/auth`'s `createAuthConfig` — Google-only, database sessions, host-only
  cookie.
- **Authorization = portal roles**: `portal_user_roles` (siteOwner, siteManager,
  accountingManager), attached to every session and checked via the capability
  helpers in `packages/auth/src/roles.ts`. New sign-ups start as `pending` and
  see nothing until approved at `/admin/users` (sign-ups whose email matches a
  shareholder are approved automatically).
- **Email safety**: only production sets `EMAIL_ENABLED=true`; everywhere else
  SES mail is redirected to `EMAIL_OVERRIDE_TO` (plus-addressed) or dropped, so
  real family members can never be emailed from dev/previews/tests.

## Development

```bash
npm install
npm run dev                # → http://localhost:3000
```

Local dev runs against the Neon `dev` branch — production data cannot be
touched from here. Root commands: `npm run lint` / `typecheck` / `test` /
`test:integration` / `test:coverage` / `format` / `e2e` / `build`.

[apps/mfr/README.md](apps/mfr/README.md) covers routes, env vars, and data.
For anything process-related — branching, CI, schema migrations, preview
deploys, e2e, rollback — **[docs/workflow.md](docs/workflow.md) is the
authoritative reference**: branch → verify locally → PR → green "CI OK" →
merge (= production deploy) → smoke-test the live site. Feature ideas and known
defects live in [docs/backlog.md](docs/backlog.md).
