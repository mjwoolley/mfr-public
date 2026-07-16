# CURRENT WORK — Staging-feedback fixes (round 3, on branch `claude/portal-features-pr2`)

## Context

PR1 (roles/auth) and PR2 (portal features) are built and deployed to `staging`
together for testing. Smoke-testing surfaced 8 issues; root causes were confirmed
by investigation. These fixes land on the **existing PR2 branch** and re-deploy to
staging. (The original PR1/PR2 plan is retained below for reference.)

## Fixes

### Portal (`apps/web`)

**1. Nav → shared tab-bar.** Rewrite `apps/web/app/PortalNav.tsx` as a tab-bar
rendered BELOW the header, mirroring `apps/reservations/app/reservations/(app)/NavBar.tsx`
and `apps/accounting/src/components/nav-tabs.tsx`: `border-b-2 py-3.5 text-[15px]`,
`font-semibold` (active `font-bold`), muted `color-mix(in srgb, var(--color-text) 60%,
transparent)`, active = `var(--color-accent)` + accent bottom border. In
`apps/web/app/layout.tsx` move it out of `PortalHeader` children (header keeps only
AuthStatus) and render `<PortalNav>` below the header. Internal links
(Home/Photos/Meals/Documents/Admin) use `usePathname` active state; external
(Reservations/Accounting) + Family Chat (new-tab + glyph) are `<a>`. Admin tab still
role-gated.

**2. Sign-in screen** (`apps/web/app/sign-in/page.tsx`). Multicolor Google "G" glyph +
"Sign in with Google"; below it a note: *"You must have a Google account to sign in to
this website. [Click here] to register for a Google account. You do not have to use
Gmail as your email service to sign up for a Google account."* — **Click here** →
`https://accounts.google.com/signup`. Keep the `callbackUrl` redirect behavior.

**3. Gate every tab; one sign-in screen.** Add `requireApproved()` (from
`apps/web/lib/authz.ts`) to the top of `/photos` and `/documents` (Meals already gated).
Remove the Documents inline "locked" prompt + empty-state branch — signed-out users are
redirected to the single `/sign-in` screen by the gate; signed-in users see the Drive
embed. Home stays public (generic — see #4).

**4. Signed-out generic home** (`apps/web/app/page.tsx`). Read the session; render the
goal card + Upcoming events ONLY when signed in. Signed-out shows the hero (kicker +
"Fifty summers on the lake." + story + slideshow) plus a "Sign in to see this year's
goal, upcoming events, meals, photos and documents" prompt → `/sign-in`.

**5. Live goal card on staging** (`apps/web/lib/portal.ts` `getFundraising`). Cause:
Vercel Deployment Protection returns 401/HTML on the server-to-server `web.staging →
accounting.staging` fetch. Add header `x-vercel-protection-bypass: <secret>` when a new
env `ACCOUNTING_BYPASS_SECRET` is set (omit otherwise — no-op in prod where protection is
off). Infra: enable "Protection Bypass for Automation" on the **accounting** Vercel
project, copy its `VERCEL_AUTOMATION_BYPASS_SECRET`, set it as `ACCOUNTING_BYPASS_SECRET`
on the **web** project's Preview→staging env. Add to `apps/web/.env.example`.

**6. Events: single-day-with-time OR multi-day range** (schema change). `portal_events`:
rename `date`→`start_date`, add `end_date date` (nullable); keep `time` /`description`
/`meeting_link`. Migrate all 5 portal Neon branches via SQL (`ALTER TABLE portal_events
RENAME COLUMN date TO start_date; ADD COLUMN end_date date`). Update
`apps/web/lib/db/schema.ts`; `getEvents` sort by `start_date` (`lib/portal.ts`);
`EventsEditor` in `apps/web/app/admin/AdminPanels.tsx` (fields: Start date, End date
[optional — "blank = single day"], Time [single-day only], Description, Zoom/Teams link)
+ `updateEvent` schema/action in `apps/web/app/admin/actions.ts`; home render in
`page.tsx` — single-day → date badge + "dow · time"; multi-day → date badge (start) +
range "Jul 1 – Jul 5".

### Accounting

**7. Link shareholder to an existing user on create/edit**
(`apps/accounting/src/actions/shareholders.ts`). In `createShareholder` (and
`updateShareholder` when the email changes), after normalizing email, query the identity
DB for a matching user and set `userId` immediately — reusing the `identityDb` + `users`
+ case-insensitive-email pattern from
`apps/accounting/src/app/accounting/api/admin/shareholder-search/route.ts`, wrapped in the
same P2002 catch as `linkShareholderToUser`. `extendSession` in
`apps/accounting/src/lib/auth.ts` stays as the reverse-order fallback.

### Reservations

**8. Calendar shows the inclusive last night** (display-only; storage stays half-open
`[start,end)`). Render `endDate − 1` as the range end in
`apps/reservations/app/reservations/(app)/calendar/formatDates.ts` `niceRange`, the
selection label in `CalendarClient.tsx` (~line 122), and the checkout display in
`BookingPanel.tsx`. Leave storage, `nightsBetween`, overlap checks, and grid colorizing
unchanged (all correct). Update the affected display tests.

## Tests & verification
- Update web `page.test.tsx` (mock session; goal/events only when signed in) and
  `tests/integration/portalContent.test.ts` (event start/end). Add an accounting
  integration test for link-on-create. Update reservations display-helper tests.
- Run `npm run typecheck && npm run test && npm run lint`; web + reservations integration
  against the Neon `test` branches; build all three apps.
- Re-deploy to `staging` (merge PR2 branch → `staging`), then smoke-test each fix: nav
  consistency, sign-in screen + note link, all tabs → one sign-in screen, signed-out
  generic home, live goal card (bypass), events (single + multi-day), calendar range reads
  inclusively, create-a-shareholder links an existing user.

## Needs the user (infra)
- Enable Protection Bypass for Automation on the accounting Vercel project and provide/set
  its secret as `ACCOUNTING_BYPASS_SECRET` on web's staging env (for fix #5). I can set the
  env var via the Vercel CLI once the secret exists.

---

# ORIGINAL PLAN (PR1 + PR2) — retained for reference

# Plan: `apps/web` redesign v2 — roles/auth centralization, then portal features

## Context

The round-2 design handoff (`/Users/mike/Downloads/design_handoff_web_v2/`) reworks the
portal app (`apps/web`) — recreating the prototype `Home.dc.html` as real App Router
routes: a reworked **Home**, and four new pages **Photos** (`/photos`), **Meals**
(`/meals`), **Documents** (`/documents`), **Admin** (`/admin`), plus a new nav and
sign-in gating. `styles.css` in the handoff is the Organic design system, already
vendored repo-wide at `packages/ui/src/organic.css` — no CSS re-adoption needed.

During planning we **expanded scope**: `apps/web` gets its **own database** and becomes
the home for **user management + a new role system** (everything not specific to
reservations or accounting):

- **Site Owner** — full power over everything, including user management.
- **Site Manager** — all functions *except* accounting admin and user management
  (i.e. portal content admin **and** reservations admin).
- **Accounting Manager** — the capability to enter contributions/expenses (today's
  `isAccountingAdmin`).

**Today `apps/web` has no business database and no data mutations** — it's server-first
and only touches the shared identity DB (via `@mfr/auth`) to show who's signed in. The
mature template to mirror is `apps/accounting` (server actions + zod + a `lib/authz.ts`
gate ladder).

### How auth works today (informs the split)

`@mfr/auth` centralizes auth **config** (Google provider, Drizzle adapter, session
callback, cookie settings, `createPortalStatusGate`). But each app instantiates its own
`NextAuth()`, runs its own `/api/auth/[...nextauth]` handler + sign-in page, and
duplicates its own authorization gates. SSO already works in prod via the shared
identity-DB session + shared cookie domain (`AUTH_COOKIE_DOMAIN`).

### Decisions (locked in)

| Decision | Choice |
|---|---|
| Delivery | **Two PRs** — (1) roles + centralized auth, (2) portal features + redesign. |
| Portal data layer | **New dedicated Neon project** for `apps/web`, **Drizzle** ORM (matches web's `identityDb` + reservations). |
| Roles storage | **Portal DB** `portal_user_roles`, keyed by identity user id (cross-DB, no FK). |
| Site Manager scope | Portal content admin **+** reservations admin (all but accounting admin & user management). |
| Roles → apps | Loaded in the **shared `@mfr/auth` session callback** → `session.user.roles`; accounting & reservations authz switch to reading them. |
| Sign-in | **Portal is the one sign-in UI.** Accounting/reservations drop their sign-in pages; signed-out users redirect to `PORTAL/sign-in?callbackUrl=<original>`. Each app keeps a NextAuth instance only to *read* the shared session (required for DB-session gating). |
| Live fundraising total | Accounting read API `/accounting/api/contributions/current-year` → `{ year, raised, goal }`; web fetches it. (PR 2) |
| Google Photos/Drive | **Match the prototype** — external album links + curated static slideshow; Documents = Drive iframe behind a server-side sign-in gate. (PR 2) |

> ⚠️ Every app's `AGENTS.md`: "This is NOT the Next.js you know… read the relevant guide
> in `node_modules/next/dist/docs/` before writing any code." Do that before writing
> route/handler/server-action code.

---

## Role / permission model

Stackable boolean flags (a user can be e.g. both Site Manager and Accounting Manager):

```
portal_user_roles (
  identity_user_id uuid PRIMARY KEY,   -- references identity users.id (cross-DB, no FK)
  is_site_owner         boolean NOT NULL DEFAULT false,
  is_site_manager       boolean NOT NULL DEFAULT false,
  is_accounting_manager boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
)
```

Derived capabilities used by gates:

| Capability | Rule |
|---|---|
| Portal content admin (schedule/albums/events/meals mgmt) | `siteOwner \|\| siteManager` |
| User management | `siteOwner` only |
| Reservations admin | `siteOwner \|\| siteManager` |
| Accounting admin (enter contributions/expenses) | `siteOwner \|\| accountingManager` |

---

> **Executed decisions (during implementation):** full migration to roles now
> (not a synced-mirror) — `session.user.roles` is the only source of authorization
> and the `isReservationsAdmin`/`isAccountingAdmin` **session** fields were removed
> (identity columns remain in the DB as a backfill source, dropped in a later
> cleanup). Reservations' own user-admin (page + API + `requirePortalAdmin`) was
> **removed**; the portal is the sole user manager. Reservations notifications now
> source "who is a reservations admin" from the portal DB via
> `@mfr/auth`'s `createReservationsAdminIdsReaderFromEnv`. All source + unit tests
> are green; the reservations notifications **integration** test still needs
> `portal_user_roles` seeding once the portal test DB exists (task 8).

# PR 1 — Roles & centralized authorization / sign-in

Goal: make roles the single source of truth for authorization across all three apps, and
make the portal the one place you sign in. Independently shippable and verifiable; ships
a plain (not-yet-redesigned) User Management page so roles are actually manageable.

### 1.1 Portal DB (minimal) + shared roles access
- Stand up the new Neon project (portal) with `dev`/`test`/`production`/`staging`
  branches. Add `apps/web/lib/portalDb.ts` (Drizzle client singleton, mirroring
  [`apps/web/lib/identityDb.ts`](apps/web/lib/identityDb.ts)) and
  `apps/web/lib/db/schema.ts` with **`portal_user_roles`** only (feature tables come in
  PR 2).
- Env plumbing: add `PORTAL_DATABASE_URL` (+ direct URL) to all three Vercel projects,
  local `.env` files, new `apps/web/.env.example`, CI integration + e2e env, and the
  shared-values list in `docs/workflow.md`. Drizzle is `drizzle-kit push`-based, so
  **push schema to `production`/`test`/`staging` manually** (CI runs no Drizzle step).

### 1.2 `@mfr/auth`: attach roles + centralize sign-in
- Add a `rolesDb` option to `createAuthConfig` and a `getUserRoles(userId)` helper in
  `packages/auth` (reads `portal_user_roles`, returns
  `{ siteOwner, siteManager, accountingManager }` defaulting all-false when no row).
- In the shared `callbacks.session` in
  [`packages/auth/src/config.ts`](packages/auth/src/config.ts:86), attach
  `session.user.roles`. Update `AppSessionUser` in
  [`packages/auth/src/types.ts`](packages/auth/src/types.ts:8) to add `roles`.
- Add a `redirect` callback allowing post-sign-in returns to same-registrable-domain
  URLs (`*.millerfamilyreunions.org`) so `callbackUrl` can send a user back to the
  accounting/reservations page they came from.

### 1.3 Backfill + seed
- Backfill `portal_user_roles` from the existing identity columns:
  `is_accounting_manager = isAccountingAdmin`, `is_site_manager = isReservationsAdmin`.
- Seed one initial **Site Owner** (`mwoolley2@gmail.com`).
- **Keep** the old `isReservationsAdmin`/`isAccountingAdmin` columns this PR (safety
  net); do not drop.

### 1.4 Switch app gates to roles
- Accounting: `requireAdmin` in
  [`apps/accounting/src/lib/authz.ts`](apps/accounting/src/lib/authz.ts:41) →
  `roles.accountingManager || roles.siteOwner`.
- Reservations: admin layout
  `apps/reservations/app/reservations/(app)/admin/(reservations-admin)/layout.tsx` and
  `apps/reservations/lib/auth/requireReservationsAdmin.ts` →
  `roles.siteManager || roles.siteOwner`.
- Web: new `apps/web/lib/authz.ts` mirroring accounting's ladder — `requireApproved`
  (via shared `createPortalStatusGate`), `requirePortalContentAdmin`
  (owner||manager), `requireSiteOwner`.

### 1.5 Canonical sign-in
- Enhance the portal sign-in page (`apps/web/app/sign-in/page.tsx`) to honor a
  `callbackUrl` query param and pass it to `signIn`.
- Point accounting's and reservations' `createPortalStatusGate` `loginPath` at
  `${HOME_URL}/sign-in?callbackUrl=<absolute current URL>` (Next `redirect()` accepts
  absolute URLs), and **remove** their own sign-in pages/routes. Keep each app's
  `/api/auth/[...nextauth]` handler (needed to read the session).

### 1.6 User Management page (plain, functional)
- `apps/web/app/admin/users/page.tsx`, gated `requireSiteOwner`, using the *current*
  layout/nav (redesign is PR 2). Lists identity users (`status`, name/email) joined with
  `portal_user_roles`; toggles for approve/block and the three role flags.
- Server actions `apps/web/app/admin/users/actions.ts` (`"use server"`, zod, gate-first,
  `revalidatePath`) writing status to the identity DB (`identityDb`) and roles to the
  portal DB. Follow
  [`apps/accounting/src/actions/goals.ts`](apps/accounting/src/actions/goals.ts) shape
  (`ActionState`, `safeParse`, `useActionState`).

### 1.7 Tests (PR 1)
- **Unit** (`apps/web`): capability helpers (owner/manager/accountingManager → gate
  outcomes).
- **Integration** (new web harness, mirroring `apps/accounting/tests/integration/`
  `setup.ts`/`testDb.ts` bound to `TEST_PORTAL_DATABASE_URL` with a guard; second vitest
  project like `apps/accounting/vitest.config.ts`): non-owner rejected from user
  management; owner sets roles → persisted; role change flows to a computed capability.
- **E2E** (`e2e/`): seed `portal_user_roles` in `e2e/global-setup.ts`; add a `siteOwner`
  persona in `e2e/personas.ts` + `e2e/session.ts`. Verify: owner-only user management;
  accounting/reservations admin still gate correctly **through roles**; signed-out user
  on accounting/reservations lands on the portal sign-in with a working `callbackUrl`.

---

> **PR 1 status: COMPLETE.** All 8 workstreams done. Verified: repo-wide
> typecheck, 225 unit tests, lint clean; web integration (5) and reservations
> integration (35) run green against the live Neon `test` branches; canonical
> sign-in + User Management built; e2e persona/global-setup/playwright + CI
> (`integration-web` job, portal ephemeral branches) wired. **User action before
> the PR can go green:** add the `NEON_PROJECT_ID_PORTAL` GitHub secret
> (`icy-breeze-74614724`) and set `PORTAL_DATABASE_URL` across the three Vercel
> projects (production branch). e2e/CI execution is validated on the first PR run.

# PR 2 — Portal features & home redesign

Goal: recreate the handoff — nav rework, reworked Home, and the Photos/Meals/Documents/
Admin pages, on top of PR 1's roles/auth. Builds on the portal DB and `session.user.roles`.

### 2.1 Portal DB feature tables + data access
Add to `apps/web/lib/db/schema.ts` (upsert-read singleton pattern like accounting's
`AppSettings`):
- **`portal_settings`** (singleton): `reunion_year`, `reunion_start`, `reunion_end`,
  `highlights_url`, `drive_url`, `venmo_url`, `chat_url`.
- **`portal_photo_albums`**: `id`, `year` (unique), `url`.
- **`portal_events`**: `id`, `date`, `time` (free text), `description`, `meeting_link`
  (nullable).
- **`portal_meal_rsvps`**: `id`, `identity_user_id`, `day_index` (1-based),
  `meal` ('L'|'D'), unique `(identity_user_id, day_index, meal)`.

`apps/web/lib/portal.ts` data access: settings upsert-read; albums/events CRUD reads;
`buildDays()` (port `Home.dc.html` lines 516-529, cap 21 days); meals aggregation
(headcount, peak, roster). **Attendees = approved identity users** (read via
`identityDb`, `status='approved'`) joined with RSVPs; sort by last name (derive
first/last from identity `name` by splitting on the last space; fall back to email — v1
simplification, structured names a later refinement).

### 2.2 Accounting read API (live fundraising)
- Extract the current-year aggregate (inlined in
  `apps/accounting/src/app/accounting/dashboard/page.tsx` lines 24-57) into
  `getRaisedThisYear()` in
  [`apps/accounting/src/lib/ledger.ts`](apps/accounting/src/lib/ledger.ts), reusing
  `currentFiscalYear()`/`fiscalYearRange()` + `getContributionGoal(year)`.
- Add `apps/accounting/src/app/accounting/api/contributions/current-year/route.ts` →
  `{ year, raised, goal }` (totals only, safe to be public; the home goal card shows to
  signed-out visitors). Web fetches it server-side via `ACCOUNTING_URL` with revalidate.

### 2.3 Server actions for portal content
`apps/web/app/admin/actions.ts` (`"use server"`, zod, `requirePortalContentAdmin`
first, `revalidatePath`): settings (year/dates/urls), album add/remove/edit, event
add/remove/edit, and the Meals `toggle` action (`requireApproved`).

### 2.4 Nav & layout
- Rework [`apps/web/app/layout.tsx`](apps/web/app/layout.tsx): keep the `PortalHeader`
  shell, replace the inline `<nav>` with a client `apps/web/app/PortalNav.tsx`
  (`'use client'`, `usePathname()`) — pattern from
  `apps/reservations/app/reservations/(app)/NavBar.tsx`. Order (README §1): Home,
  Reservations (ext), Accounting (ext), Photos, Meals, Documents, Family Chat (ext,
  new-tab + glyph, `chatUrl` from settings), Admin (gear, shown only when
  `roles.siteOwner || roles.siteManager`), Sign in/out. Active link = **accent-700,
  bold**. External URLs from `@mfr/ui` (`RESERVATIONS_URL`/`ACCOUNTING_URL`).

### 2.5 Pages (port `Home.dc.html` markup; it already uses Organic classes/vars verbatim)
- **Home** [`apps/web/app/page.tsx`](apps/web/app/page.tsx): remove app cards, hero CTA
  buttons, ridgeline divider (README §2). Two-col hero: left = kicker + "Fifty summers on
  the lake." + two verbatim story paragraphs (lines 64-67); right = new client
  `HomeSlideshow.tsx` (auto-crossfade ~4.8s, dots, curated static images in `public/`
  starting with `public/lake-house.jpg`, "Open the highlights album" → `highlightsUrl`)
  + goal card (server-fetch the accounting API; progress bar, Venmo button, "Full ledger
  →"). Below: Upcoming events from `portal_events`, ascending by date, Join buttons.
- **Photos** `apps/web/app/photos/page.tsx`: intro + highlights button + responsive grid
  of per-year album cards (View / Add photos when linked; "Add link" → Admin when not).
- **Meals** `apps/web/app/meals/page.tsx`: **sign-in gated** (`requireApproved`). Days
  from settings; "Your meals" toggles (client + toggle action); per-day headcount +
  "Biggest meal so far"; roster matrix sorted by last name, current user's row
  highlighted (port `renderVals()` meals logic, lines 619-663).
- **Documents** `apps/web/app/documents/page.tsx`: **server-side sign-in gate** —
  signed-out sees the locked prompt; signed-in sees the Drive iframe
  (`embeddedfolderview?id={parsed from driveUrl}#list`, regex line 697) + "Open in
  Google Drive". Note the legacy endpoint drops `resourcekey`, so the folder must be
  "anyone with link".
- **Admin** `apps/web/app/admin/page.tsx` (+ layout gated `requirePortalContentAdmin`):
  panels for **Reunion schedule**, **Photo albums** (+ highlights link), **Upcoming
  events**, and **absorb the PR-1 User Management** page as a section/link (owner-only).
  Client editors with `useActionState`/`useTransition`, mirroring
  `apps/accounting/src/app/accounting/admin/settings-cards.tsx`.

### 2.6 Tests (PR 2)
- **Unit**: `buildDays`, roster sort, goal math; extend `apps/web/app/page.test.tsx`.
- **Integration**: settings/album/event CRUD; meal toggle persists; invalid input →
  `{ error }`.
- **E2E**: seed portal feature tables + reunion settings in `e2e/global-setup.ts`; new
  `e2e/tests/web.spec.ts` cases — nav/active states, meals toggle round-trip, documents
  gate (locked signed-out / iframe signed-in), admin content edits reflecting on public
  pages.

---

## Files at a glance

**PR 1 — new:** `apps/web/lib/portalDb.ts`, `apps/web/lib/db/schema.ts` (roles only),
`apps/web/lib/authz.ts`, `apps/web/app/admin/users/{page.tsx,actions.ts}`,
`apps/web/.env.example`, web integration-test harness, portal Drizzle config.
**PR 1 — modified:** `packages/auth/src/{config.ts,types.ts,index.ts}`,
`apps/accounting/src/lib/authz.ts`, reservations admin gate +
`requireReservationsAdmin.ts`, both apps' `createPortalStatusGate` login paths (+ remove
their sign-in pages), `apps/web/app/sign-in/page.tsx`,
`e2e/{global-setup.ts,personas.ts,session.ts}`, `docs/workflow.md`.

**PR 2 — new:** `apps/web/lib/portal.ts`, `apps/web/app/PortalNav.tsx`,
`apps/web/app/HomeSlideshow.tsx`,
`apps/web/app/{photos,meals,documents,admin}/page.tsx`, `apps/web/app/admin/actions.ts`
(+ admin editor client components),
`apps/accounting/.../api/contributions/current-year/route.ts`.
**PR 2 — modified:** `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`,
`apps/web/lib/db/schema.ts` (feature tables), `apps/accounting/src/lib/ledger.ts`,
`e2e/{global-setup.ts,tests/web.spec.ts}`, `docs/backlog.md` (delete Photos item #4 once
shipped).

---

## Verification (per `docs/workflow.md`, run for each PR on its own branch)

Branch first (never push to `main`). For each PR:
1. `npm run typecheck && npm run lint && npm run test` (unit, no DB).
2. Local run against Neon `dev`: `npm run dev:web` (+ `:accounting`/`:reservations` as
   needed).
   - **PR 1:** as Site Owner, open `/admin/users`, change a user's roles/status; confirm
     that user gains/loses accounting-admin and reservations-admin access accordingly;
     confirm a signed-out user clicking into accounting/reservations lands on the
     **portal** sign-in and returns to where they were after signing in.
   - **PR 2:** click through every flow — nav + active states, home slideshow/**live**
     goal card/events, Photos, Meals RSVP toggles + roster/headcount, Documents
     signed-out (locked) vs signed-in (iframe), Admin edits reflecting on public pages.
3. `npm run test:integration` (real `test` branches incl. portal) and `npm run build`.
4. `npm run e2e`.
5. Open the PR (`gh pr create`); the single required check is **"CI OK."**
6. After merge auto-deploys all three apps, smoke-test production (~2 min): PR 1 — sign
   in once, confirm accounting/reservations admins retained access via roles; PR 2 —
   goal card, one Admin edit, a meal toggle.

## Sequencing note (PR 1, the risky seam)

Within PR 1, order the role migration defensively: stand up portal roles infra → backfill
from existing columns + attach to session → switch accounting/reservations gates (old
columns kept as a safety net) → verify both apps still gate correctly before relying on
the new model. A follow-up cleanup PR can drop the deprecated `isReservationsAdmin`/
`isAccountingAdmin` columns once the role model is proven in production.
