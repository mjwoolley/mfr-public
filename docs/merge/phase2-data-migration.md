# Phase 2 — Data migration + accounting cross-check (2026-07-17)

Rehearsed by migrating all four production databases into the unified **dev**
branch (`br-billowing-art-ajggj4uw`). The same procedure runs into the unified
`production` branch at cutover (Phase 7). Reusable script:
`scripts/merge/migrate-unified.sh` (connection strings via env, no secrets).

## Procedure

Per-domain `pg_dump --data-only -n public` (excluding `_prisma_migrations` and
`__drizzle_migrations`), loaded in order **identity → portal → reservations →
accounting**. No ID remapping — disjoint table names, cross-domain refs by value
(no cross-DB FKs). `session_replication_role=replica` is NOT available to the
Neon role, but it isn't needed: pg_dump orders each dump FK-safe, there are no
CORRECTION/ADJUSTMENT rows so `Transaction.correctsTransactionId` is never
populated (no self-FK ordering hazard), and the reservations triggers pass for
internally-consistent prod data.

### Bug found & fixed during rehearsal

The reservations load initially failed: `relation "blocked_dates" does not
exist`. Cause: the push-only trigger functions referenced `blocked_dates` /
`reservations` **unqualified**, and pg_dump sets `search_path=''` during a data
load, so the triggers couldn't resolve the tables mid-COPY. Fixed by
schema-qualifying the lookups (`public.blocked_dates` / `public.reservations`)
in `apps/mfr/lib/db/push-only.sql`. Re-applied to dev + test.

## Loaded row counts (unified dev)

| domain       | table                                                                   |                       rows |
| ------------ | ----------------------------------------------------------------------- | -------------------------: |
| identity     | users                                                                   |                          2 |
| portal       | portal_settings / portal_user_roles                                     |                      1 / 1 |
| reservations | reservations / activity_log / booking_rules / blocked_dates             |            23 / 56 / 1 / 0 |
| accounting   | Shareholder / Transaction / LedgerEntry / TransactionApproval / Expense | 25 / 321 / 339 / 339 / 144 |

Singletons present: `booking_rules` id=1, `portal_settings`, `AppSettings`,
`ContributionGoal`.

## Accounting integrity cross-check — 3 layers, all PASS

Reference: the Phase-0 fingerprint (re-derived fresh from accounting-prod to
avoid the prettier-reformatted committed JSON).

1. **Row counts** per table match the fingerprint exactly.
2. **Aggregate checksums** — fresh `accounting-fingerprint.sql` run against
   accounting-prod vs unified-dev is **byte-identical**: expense sum
   $136,624.97 / 144 rows, per-FY expense totals (FY2020–FY2026), 303
   contributions, 18 transfers, 376,019.92 total shares, and all 25
   per-shareholder balances.
3. **Row-level equality** — per-table content hash
   (`md5(string_agg(md5(to_jsonb(row)::text) ORDER BY …))`, which is immune to
   both row order and the Prisma-vs-Drizzle physical column order) is identical
   prod↔unified for all 7 tables:
   Shareholder / Transaction / LedgerEntry / TransactionApproval / Expense /
   ContributionGoal / AppSettings.

**Deferred to Phase 3** (needs the Drizzle rewrite): run the app's own ledger
functions (`getAllShareholderBalances`, `getRaisedThisYear`, fiscal-year
buckets) on the Drizzle implementation against unified-dev and assert identical
output to prod's Prisma results — validates the read path, not just storage.
