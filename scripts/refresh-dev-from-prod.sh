#!/usr/bin/env bash
#
# Refresh the `dev` branch of each Neon project with a fresh copy of its
# `production` branch, so local development runs against realistic data.
#
# WHY THIS SCRIPT EXISTS
#   In every MFR Neon project the `dev` branch is the *root* and `production`
#   is a child forked off it (inverted from Neon's usual layout). Because of
#   that, Neon's one-click "reset from parent" can't pull production -> dev.
#   This script does the copy explicitly: it snapshots the dev branch, then
#   replaces its contents with a schema+data dump of production. The dev branch
#   IDs never change, so connection strings (local .env) keep working.
#
# SAFETY
#   - Production is only ever READ (pg_dump). It is never written.
#   - The dev branch is snapshotted to `backup-dev-<timestamp>` before being
#     overwritten, so a bad run is fully recoverable.
#   - This OVERWRITES whatever is currently in the dev branches. Any data you
#     set up only there will be lost (recoverable from the snapshot).
#
# REQUIREMENTS
#   - pg_dump / pg_restore that are >= the server version (Neon runs PG17).
#     Homebrew: `brew install libpq` then add its bin to PATH, e.g.
#       export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
#   - Neon auth for the CLI: export NEON_API_KEY=... (or run `neonctl auth`).
#     The CLI is invoked via `npx neonctl` so no global install is needed.
#
# USAGE
#   ./scripts/refresh-dev-from-prod.sh                       # prompts first
#   ./scripts/refresh-dev-from-prod.sh --yes                 # skip the prompt
#   ./scripts/refresh-dev-from-prod.sh accounting            # one project only
#   ./scripts/refresh-dev-from-prod.sh --yes reservations
set -euo pipefail

# project label | Neon project id | production branch id | dev branch id
PROJECTS=(
  "accounting|nameless-fog-46521987|br-proud-wind-a642mkzo|br-wild-surf-a6w3iro4"
  "reservations|sweet-tooth-47867008|br-mute-cell-afh5kusc|br-weathered-firefly-afkvvx7g"
  "identity|flat-tree-08961616|br-patient-water-ajen7oii|br-summer-brook-ajs1uwtt"
)

ASSUME_YES=0
ONLY=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y) ASSUME_YES=1 ;;
    *) ONLY="$1" ;;
  esac
  shift
done

command -v pg_dump >/dev/null || { echo "pg_dump not on PATH (see REQUIREMENTS)"; exit 1; }
command -v pg_restore >/dev/null || { echo "pg_restore not on PATH (see REQUIREMENTS)"; exit 1; }

neon() { npx --yes neonctl "$@"; }
conn() { # project_id branch_id -> direct (non-pooled) connection URI
  neon connection-string "$2" --project-id "$1" --database-name neondb 2>/dev/null
}

if [[ "$ASSUME_YES" -ne 1 ]]; then
  echo "This OVERWRITES the dev branch data for: ${ONLY:-all three projects}."
  echo "Each dev branch is snapshotted first. Production is only read."
  read -r -p "Continue? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

STAMP="$(date +%Y-%m-%d-%H%M%S)"

for row in "${PROJECTS[@]}"; do
  IFS='|' read -r label project_id prod_branch dev_branch <<<"$row"
  [[ -n "$ONLY" && "$ONLY" != "$label" ]] && continue

  echo ""
  echo "=== $label ($project_id) -> dev ==="

  echo "-- snapshotting dev -> backup-dev-$STAMP"
  neon branches create --project-id "$project_id" --parent "$dev_branch" \
    --name "backup-dev-$STAMP" >/dev/null

  echo "-- resolving connection strings"
  SRC="$(conn "$project_id" "$prod_branch")"
  DST="$(conn "$project_id" "$dev_branch")"
  [[ -n "$SRC" && -n "$DST" ]] || { echo "failed to resolve connection strings"; exit 1; }

  echo "-- copying production -> dev (schema + data)"
  pg_dump -Fc "$SRC" | pg_restore --clean --if-exists --no-owner --no-acl -d "$DST"

  echo "-- done: $label dev now mirrors production"
done

echo ""
echo "All requested projects refreshed. Snapshots preserved as backup-dev-$STAMP."
