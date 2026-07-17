# mfr

Monorepo for the **Miller Family Reunions portal** (millerfamilyreunions.org) — the
family's lake house on Lake Lure, NC, run as a small corporation. One repo, three
independently-deployed Next.js apps, one shared identity layer: a member signs in
once (Google) and is recognized across the whole portal.

## Structure

```
apps/
  web/            the portal (millerfamilyreunions.org): public home, photos,
                  meals, documents, canonical sign-in, and admin — content
                  editing plus user approval & role management for the suite
  reservations/   cabin booking (reservations.millerfamilyreunions.org)
  accounting/     shareholder ledger (accounting.millerfamilyreunions.org)
packages/
  auth/           @mfr/auth — shared Auth.js config factory, identity-DB schema,
                  and the portal-roles model every app authorizes against
  ui/             @mfr/ui — shared "Organic" design-system components + CSS
e2e/              Playwright browser smoke tests across all three apps
scripts/          operational scripts (refresh dev/staging data from prod)
docs/             workflow.md (THE change workflow — read it first), backlog.md
```

Each app deploys to Vercel as its own project (Root Directory per app); the
monorepo exists for code sharing, not deployment coupling. Shared packages are
consumed as raw TypeScript via `transpilePackages` — no build step.

## Architecture in one minute

- **Four Neon Postgres projects**: `mfr-identity` (shared Auth.js users/sessions),
  `mfr-portal` (portal content + roles), `mfr-reservations`, `mfr-accounting`
  (per-app business data). **No cross-database foreign keys** — business tables
  store identity `users.id` as a plain string and merge names in app code.
- **One login everywhere**: every app builds its NextAuth instance from
  `@mfr/auth`'s `createAuthConfig` with the same `AUTH_SECRET` and identity DB;
  the session cookie spans subdomains via `AUTH_COOKIE_DOMAIN`. The portal
  (apps/web) hosts the only sign-in page; the other apps redirect to it.
- **Authorization = portal roles**: `portal_user_roles` (siteOwner, siteManager,
  accountingManager) in the portal DB, attached to every session and checked via
  the capability helpers in `packages/auth/src/roles.ts`. New sign-ups start as
  `pending` and see nothing until approved at `/admin/users`.
- **Email safety**: only production sets `EMAIL_ENABLED=true`; everywhere else
  SES mail is redirected to `EMAIL_OVERRIDE_TO` (plus-addressed) or dropped, so
  real family members can never be emailed from dev/staging/tests.

## Development

```bash
npm install
npm run dev:web            # portal      → localhost:3002
npm run dev:reservations   # bookings    → localhost:3000/reservations
npm run dev:accounting     # ledger      → localhost:3001/accounting
npm run dev:all            # all three at once
```

Local dev runs against the `dev` branch of each Neon project — production data
cannot be touched from here. Root commands: `npm run lint` / `typecheck` /
`test` / `test:integration` / `test:coverage` / `format` / `e2e` / `build`.

Each app's README covers its own env vars, data model, and setup. For anything
process-related — branching, CI, schema migrations, staging, e2e, rollback —
**[docs/workflow.md](docs/workflow.md) is the authoritative reference**:
branch → verify locally → PR → green "CI OK" → merge (= production deploy) →
smoke-test the live site. Feature ideas and known defects live in
[docs/backlog.md](docs/backlog.md).
