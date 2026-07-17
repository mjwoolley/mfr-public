# MFR — Reservations (apps/reservations)

Cabin booking for the family lake house, served under the `/reservations` base
path (**reservations.millerfamilyreunions.org**). Members see a shared
availability calendar and book stays; admins manage everyone's reservations,
blocked dates, and the booking rules.

## Features

- **Calendar** (month grid + list view) with two-click date selection and a
  create/edit dialog that validates live as you pick dates
- **My Reservations**, per-person **Summary**, and an **Activity** feed of every
  change (bookings, cancellations, rule edits, sign-ups)
- **Admin** (site owner / site manager): all reservations (edit/cancel on a
  member's behalf), blocked date ranges, booking rules (horizon date, max
  consecutive nights, per-user yearly night cap)
- **Email notifications** (confirmation / updated / cancelled) via Amazon SES +
  react-email, cc'ing reservations admins

## The three enforcement layers

1. **Rules engine** — `lib/rules/validateReservation.ts`, a pure function run
   client-side (live dialog feedback) _and_ server-side (POST/PATCH).
2. **Database constraints** — a GiST exclusion constraint forbids overlapping
   confirmed reservations, and triggers forbid reservation↔blocked-date
   overlaps (`drizzle/0001_overlap_constraints.sql`). This is what wins races:
   concurrent conflicting bookings surface as 409s (`lib/db/isOverlapError.ts`).
3. **Authorization guards** — `lib/auth/require*.ts`: session → approved →
   reservations-admin (portal roles via `@mfr/auth`).

## Stack & data

Next.js (App Router) on Vercel · Neon Postgres (`mfr-reservations`) via Drizzle
(`lib/db/schema.ts`: reservations, blocked_dates, booking_rules singleton,
activity_log) · shared identity DB via `@mfr/auth` (users/sessions — **no
cross-DB joins**; names are merged in app code) · portal DB read for roles and
the admin CC list.

Dates are ISO `YYYY-MM-DD` strings everywhere, UTC-pinned, half-open ranges
(`[start, end)` — checkout day is bookable by the next stay).

**Schema changes are manual**: `npx drizzle-kit push` against production (and
the `test` branch) — no migration journal, no CI Drizzle step. See
[docs/workflow.md](../../docs/workflow.md) for why, and note plain `drizzle-kit
push` would strip the hand-written constraints in
`drizzle/0001_overlap_constraints.sql`.

## Local development

```bash
npm install                 # at the repo root
npm run dev:reservations    # http://localhost:3000/reservations
```

Env vars live in `.env` — `.env.example` documents every variable
(DB URLs, shared `AUTH_*`, SES + the `EMAIL_ENABLED` prod-only guard,
`TEST_*` integration-test branches; `CRON_SECRET` is declared but unused —
reserved for a future milestone).

## Tests

```bash
npm test                   # vitest unit project (rules engine, helpers, UI logic)
npm run test:integration   # real Neon test branches; needs the TEST_* env vars;
                           # runs serialized — setup TRUNCATES those branches
```

Repo-root `npm run e2e` drives the deployed-style apps in a browser
(see [docs/workflow.md](../../docs/workflow.md#e2e-tests-playwright)).
