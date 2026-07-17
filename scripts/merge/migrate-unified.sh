#!/usr/bin/env bash
# Data migration for the single-app merge: copy all four production databases
# into one unified MFR database. Rehearsed against dev in Phase 2; run against
# the unified `production` branch at cutover (Phase 7).
#
# Connection strings are read from the environment (never hard-code secrets):
#   SRC_IDENTITY_URL   SRC_PORTAL_URL   SRC_RESERVATIONS_URL   SRC_ACCOUNTING_URL
#   TARGET_URL         (the unified DB branch to load into — use the DIRECT/
#                       unpooled URL, sslmode=require)
#
# Preconditions on TARGET_URL:
#   * schema already pushed (`drizzle-kit push` from apps/mfr) AND
#   * push-only objects applied (`psql "$TARGET_URL" -f apps/mfr/lib/db/push-only.sql`)
#     — the trigger functions MUST be the search_path-safe (public.-qualified)
#     version, or the reservations load fails under pg_dump's empty search_path.
#
# No ID remapping is needed: the four schemas have disjoint table names and all
# cross-domain references are by value (identity users.id), with no cross-DB FKs.
set -euo pipefail

PGBIN="${PGBIN:-/opt/homebrew/opt/libpq/bin}"
PGD="$PGBIN/pg_dump"
PSQL="$PGBIN/psql"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

: "${SRC_IDENTITY_URL:?}" "${SRC_PORTAL_URL:?}" "${SRC_RESERVATIONS_URL:?}" "${SRC_ACCOUNTING_URL:?}" "${TARGET_URL:?}"

dump() { # $1=url $2=name
  "$PGD" "$1" --data-only --no-owner --no-privileges -n public \
    --exclude-table=_prisma_migrations --exclude-table='*__drizzle_migrations*' \
    > "$WORK/data-$2.sql"
  echo "dumped $2 ($(grep -c '^COPY ' "$WORK/data-$2.sql") tables)"
}

# Order: identity -> portal -> reservations -> accounting (logical user refs
# resolve; within each dump pg_dump orders tables FK-safe).
dump "$SRC_IDENTITY_URL"     identity
dump "$SRC_PORTAL_URL"       portal
dump "$SRC_RESERVATIONS_URL" reservations
dump "$SRC_ACCOUNTING_URL"   accounting

for d in identity portal reservations accounting; do
  echo "loading $d -> TARGET"
  "$PSQL" "$TARGET_URL" -v ON_ERROR_STOP=1 -q -f "$WORK/data-$d.sql"
done
echo "✅ migration complete"
