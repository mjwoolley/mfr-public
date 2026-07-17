# Phase 0 — Safety backups & fingerprint (2026-07-17)

Pre-merge safety artifacts for the single-app / single-database consolidation.
**Nothing here is deleted until the merged production is verified in Phase 7.**
The old Neon projects + the three old Vercel projects remain the rollback.

## Production branch topology (inverted: `dev` = default/root, `production` = child)

| DB           | Neon project     | project ID            | `production` branch       | PG  |
| ------------ | ---------------- | --------------------- | ------------------------- | --- |
| identity     | mfr-identity     | flat-tree-08961616    | br-patient-water-ajen7oii | 17  |
| portal       | mfr-portal       | icy-breeze-74614724   | br-small-base-ad4iyt8q    | 17  |
| reservations | mfr-reservations | sweet-tooth-47867008  | br-mute-cell-afh5kusc     | 17  |
| accounting   | mfr-accounting   | nameless-fog-46521987 | br-proud-wind-a642mkzo    | 17  |

## Backup #1 — Neon branch snapshots (copy-on-write point-in-time copies)

Created off each `production` branch on 2026-07-17:

| DB           | backup branch name             | backup branch ID            |
| ------------ | ------------------------------ | --------------------------- |
| identity     | backup-identity-2026-07-17     | br-purple-field-ajeqy1hd    |
| portal       | backup-portal-2026-07-17       | br-crimson-fog-adpf5b9x     |
| reservations | backup-reservations-2026-07-17 | br-morning-firefly-afr9twxy |
| accounting   | backup-accounting-2026-07-17   | br-broad-dew-a6yl08nb       |

## Backup #2 — File-level pg_dump (custom format, schema + data)

Location (persistent, outside the git worktree): `~/mfr-backups/2026-07-17-premerge/`
Dumped with `pg_dump --format=custom --no-owner --no-privileges` (client pg_dump 18.4,
direct/non-pooler connections). Each archive validated with `pg_restore --list`.

| file                                  | bytes | sha256 (see backup-dumps-SHA256SUMS.txt) |
| ------------------------------------- | ----- | ---------------------------------------- |
| mfr-identity-prod-2026-07-17.dump     | 9627  | e109e397…                                |
| mfr-portal-prod-2026-07-17.dump       | 8044  | d2395ca0…                                |
| mfr-reservations-prod-2026-07-17.dump | 15553 | 8b0c56d2…                                |
| mfr-accounting-prod-2026-07-17.dump   | 55549 | b61e2c90…                                |

## Accounting content fingerprint (Phase-2 cross-check reference)

Full JSON: `accounting-fingerprint-2026-07-17.json` (query: `accounting-fingerprint.sql`).
Phase 2 must reproduce these numbers **exactly** in the merged DB.

Headline figures captured from live accounting-prod:

- Shareholders: **25** (all active)
- Transactions: **321** total, 0 soft-deleted — **303 CONTRIBUTION**, **18 TRANSFER**
- LedgerEntry: **339** · TransactionApproval: **339** (303 contrib × 1 + 18 transfer × 2 = 339 ✓)
- Expenses: **144 rows**, total **$136,624.97** ✓ (matches the known hand-loaded figure exactly)
- Total shares outstanding (non-deleted): **376,019.92**
- ContributionGoal: 1 · AppSettings: 1 (singleton)
- Per-shareholder balances + per-fiscal-year expense totals: in the JSON.

### ⚠️ Discrepancy vs the plan/memory figure of "266 contributions"

The plan and the `mfr-accounting-prod-data` memory cite **266 contributions**; live prod
now has **303 CONTRIBUTION transactions**. This is **not** a capture error:

- The expense figure ($136,624.97 / 144 rows) matches the plan **exactly**, and the
  ledger arithmetic is internally consistent (339 entries = 303×1 + 18×2).
- The "266" was recorded ~2026-07-08/09 when the accounting data memory was written;
  ~37 more contributions have been entered since.

**The live fingerprint (303), not the stale "266", is the authoritative Phase-2 reference.**
The `mfr-accounting-prod-data` memory should be updated to 303.
