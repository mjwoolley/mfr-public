# @mfr/auth

The identity layer: the Auth.js (NextAuth v5) config factory, the identity
table definitions, and the portal-roles model — consumed by `apps/mfr` as raw
TypeScript via `transpilePackages`.

## What it provides

- **`createAuthConfig(opts)`** (`src/config.ts`) — the NextAuth config factory:
  Google-only sign-in, **database sessions** via the Drizzle adapter, and the
  session callback that attaches `id`, `status`, and `roles` to every session.
  Hooks: `extendSession` (the app attaches `shareholderId`) and
  `onUserCreated` (the app logs the sign-up and auto-approves shareholders).
  The optional cross-subdomain cookie options (`cookieDomain`,
  `sessionCookieName`) are unused now that the site is one origin.
- **Identity schema + client** (`src/schema.ts`, `src/db.ts`) — `users` (with
  portal status pending/approved/blocked), `accounts`, `sessions`,
  `verification_tokens`. These tables live in the app's single database and are
  migrated with the rest of the app schema (`apps/mfr/lib/db/schema/identity.ts`).
- **Portal roles** (`src/roles.ts`) — the authorization model. Three stackable
  role flags stored in `portal_user_roles` (managed at `/admin/users`; role
  grants are site-owner only), read via `createRolesReader(DATABASE_URL)`:

  | Role                | Capabilities                                                |
  | ------------------- | ----------------------------------------------------------- |
  | `siteOwner`         | everything, including role assignment                       |
  | `siteManager`       | portal content admin + reservations admin + member approval |
  | `accountingManager` | accounting admin                                            |

  The app never checks role flags directly — they use the derived capability
  helpers (`canManageUsers`, `canApproveMembers`, `canManagePortalContent`,
  `canAdminReservations`, `canAdminAccounting`) so the mapping lives in exactly
  one place.

- **`createPortalStatusGate`** (`src/portalStatusGate.ts`) — the
  pending/blocked/sign-in redirect ladder that reservations and accounting each
  configure with their own paths.
- **`@mfr/auth/types`** — the `AppSessionUser` module-augmentation pattern for
  app-specific session fields.

## The one-login design

One NextAuth instance at `/api/auth`, one host-only session cookie on
millerfamilyreunions.org. Per-PR previews (on `*.vercel.app`) sign in through
production's redirect proxy and must share its `AUTH_SECRET` — see
`docs/preview-deploys.md`. Business tables store `users.id` as a plain value —
no cross-domain foreign keys.

Note: the `users.is_reservations_admin` / `is_accounting_admin` columns are
legacy — nothing reads them (superseded by portal roles); kept only as a
backfill source until a follow-up migration drops them.

## Env & scripts

The app passes everything in explicitly (`DATABASE_URL`, plus `AUTH_SECRET` /
`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` read by Auth.js). Scripts: `npm test`,
`test:coverage`, `test:mutation`. The package's own `generate` / `migrate`
scripts, `drizzle.config.ts`, `createIdentityDbFromEnv`, and
`createRolesReaderFromEnv` (which read the retired `IDENTITY_*` /
`PORTAL_DATABASE_URL` vars) are leftovers from the multi-database era and
unused.
