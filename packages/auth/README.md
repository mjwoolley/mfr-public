# @mfr/auth

The shared identity layer: one Auth.js (NextAuth v5) setup, one identity
database, one portal-roles model — consumed by all three apps as raw TypeScript
via `transpilePackages`, so a change here ships to the whole portal at once.

## What it provides

- **`createAuthConfig(opts)`** (`src/config.ts`) — the NextAuth config factory:
  Google-only sign-in, **database sessions** via the Drizzle adapter, the
  cross-subdomain cookie setup (`cookieDomain`, `sessionCookieName`), and the
  session callback that attaches `id`, `status`, and `roles` to every session.
  Per-app hooks: `extendSession` (e.g. accounting attaches `shareholderId`),
  `onUserCreated` (e.g. reservations logs sign-ups).
- **Identity DB schema + clients** (`src/schema.ts`, `src/db.ts`,
  `src/identityDbFromEnv.ts`) — `users` (with portal status
  pending/approved/blocked), `accounts`, `sessions`, `verification_tokens`.
  Its own Neon project (`mfr-identity`); migrated with drizzle-kit via
  `IDENTITY_DIRECT_DATABASE_URL`.
- **Portal roles** (`src/roles.ts`) — the authorization model. Three stackable
  role flags stored in the **portal DB's** `portal_user_roles` (managed at the
  portal's `/admin/users`; role grants are site-owner only), read via
  `createRolesReaderFromEnv()` (`PORTAL_DATABASE_URL`):

  | Role                | Capabilities                                                |
  | ------------------- | ----------------------------------------------------------- |
  | `siteOwner`         | everything, including role assignment                       |
  | `siteManager`       | portal content admin + reservations admin + member approval |
  | `accountingManager` | accounting admin                                            |

  Apps never check role flags directly — they use the derived capability
  helpers (`canManageUsers`, `canApproveMembers`, `canManagePortalContent`,
  `canAdminReservations`, `canAdminAccounting`) so the mapping lives in exactly
  one place.

- **`createPortalStatusGate`** (`src/portalStatusGate.ts`) — the shared
  pending/blocked/sign-in redirect ladder each app configures with its paths.
- **`@mfr/auth/types`** — the `AppSessionUser` module-augmentation pattern for
  app-specific session fields.

## The one-login design

Same `AUTH_SECRET` + same identity DB + `AUTH_COOKIE_DOMAIN=
.millerfamilyreunions.org` ⇒ a database-session cookie that every subdomain
shares — sign in once at the portal, recognized everywhere. Any second
environment sharing that registrable domain would set a distinct
`AUTH_SESSION_COOKIE_NAME` so production's cookie (which rides along to every
subdomain) is never read as that environment's session; per-PR previews live on
`*.vercel.app` (a different registrable domain) and so leave it unset. Business
databases store `users.id` as a plain string — **no cross-database FKs**.

Note: the `users.is_reservations_admin` / `is_accounting_admin` columns are
legacy — nothing reads them (superseded by portal roles); kept only as a
backfill source until a follow-up migration drops them.

## Env & scripts

`IDENTITY_DATABASE_URL` (pooled, runtime) · `IDENTITY_DIRECT_DATABASE_URL`
(drizzle-kit) · `PORTAL_DATABASE_URL` (roles reader) · `AUTH_GOOGLE_ID/SECRET`
· `AUTH_SECRET` (identical across apps). Scripts: `npm run generate` /
`migrate` (drizzle-kit), `npm test`.
