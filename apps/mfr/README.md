# MFR — Portal (apps/web)

The portal at **millerfamilyreunions.org**: the family's public front door and the
members' hub. It is also the control plane for the whole suite — it hosts the
**canonical sign-in page** (reservations and accounting redirect here) and the
admin screens where users are approved and roles granted.

## Routes

| Route                     | Access                    | What it is                                                                                    |
| ------------------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| `/`                       | public                    | Home: hero slideshow; fundraising goal card + upcoming events (signed-in only)                |
| `/photos`                 | approved members          | Per-year Google Photos album cards                                                            |
| `/meals`                  | approved members          | Reunion-week lunch/dinner RSVPs, headcounts, roster grid                                      |
| `/documents`              | approved members          | Embedded shared Google Drive folder                                                           |
| `/sign-in`                | public                    | Canonical Google sign-in for all three apps (callbackUrl round-trip)                          |
| `/admin`                  | site owner **or** manager | Content editing: reunion schedule, links, photo albums, events                                |
| `/admin/users`            | site owner **or** manager | Approve/block users; role grants (siteOwner / siteManager / accountingManager) are owner-only |
| `/api/auth/[...nextauth]` | —                         | Auth.js handlers                                                                              |

## Stack & data

Next.js (App Router) on Vercel · **its own Neon Postgres project (`mfr-portal`)**
via Drizzle (`lib/db/schema.ts`: `portal_user_roles`, `portal_settings`,
`portal_photo_albums`, `portal_events`, `portal_meal_rsvps`) · plus read access
to the shared identity DB (`@mfr/auth`) for attendee names and user management.

Notable design points:

- **Roles live here.** `portal_user_roles` is the single authorization source
  for the whole portal; the other apps read it through `@mfr/auth`'s roles
  reader. See `packages/auth/README.md`.
- **Fundraising is not duplicated.** The home goal card fetches accounting's
  public `/accounting/api/contributions/current-year` live (60s revalidate,
  degrades to hidden if unreachable).
- **Schema deploys are manual.** `npx drizzle-kit push` from this directory
  (uses `PORTAL_DIRECT_DATABASE_URL`); there is no migration journal and no CI
  Drizzle step — see the schema-change notes in [docs/workflow.md](../../docs/workflow.md).

## Local development

```bash
npm install            # at the repo root
npm run dev:web        # http://localhost:3002
```

Env vars live in `.env` — see `.env.example` for the commented list
(`PORTAL_DATABASE_URL`, `IDENTITY_DATABASE_URL`, the shared `AUTH_*` values,
`NEXT_PUBLIC_*` cross-app URLs). Shared values must match the other apps.

## Tests

```bash
npm test                   # vitest unit project
npm run test:integration   # real queries against Neon test branches; needs
                           # TEST_PORTAL_DATABASE_URL + TEST_IDENTITY_DATABASE_URL
```

Integration setup **truncates** the test branches — the `TEST_*` env names are
the only guard; never point them at real databases. Coverage thresholds are
enforced at 100% for `lib/**`, `app/**/actions.ts`, and API routes.
