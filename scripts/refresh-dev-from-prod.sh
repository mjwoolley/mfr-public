#!/usr/bin/env bash
#
# Refresh a non-production branch of each Neon project with a fresh copy of its
# `production` branch, so that environment runs against realistic data.
#
#   --target dev       (default) refresh the local-development `dev` branches
#   --target staging   refresh the always-online staging deploy's `staging` branches
#
# WHY THIS SCRIPT EXISTS
#   In every MFR Neon project the `dev` branch is the *root* and `production`
#   is a child forked off it (inverted from Neon's usual layout). Because of
#   that, Neon's one-click "reset from parent" can't pull production -> dev.
#   This script does the copy explicitly: it snapshots the target branch, then
#   replaces its contents with a schema+data dump of production. The target
#   branch IDs never change, so connection strings (local .env, or the staging
#   env vars on Vercel) keep working.
#
# SAFETY
#   - Production is only ever READ (pg_dump). It is never written.
#   - The target branch is snapshotted to `backup-<target>-<timestamp>` before
#     being overwritten, so a bad run is fully recoverable.
#   - This OVERWRITES whatever is currently in the target branches. Any data you
#     set up only there will be lost (recoverable from the snapshot).
#   - Staging keeps EMAIL_ENABLED unset (mail redirected to EMAIL_OVERRIDE_TO),
#     so copying real family emails into it never risks a real send.
#
# REQUIREMENTS
#   - pg_dump / pg_restore that are >= the server version (Neon runs PG17).
#     Homebrew: `brew install libpq` then add its bin to PATH, e.g.
#       export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
#   - Neon auth for the CLI: export NEON_API_KEY=... (or run `neonctl auth`).
#     The CLI is invoked via `npx neonctl` so no global install is needed.
#
# USAGE
#   ./scripts/refresh-dev-from-prod.sh                       # dev, prompts first
#   ./scripts/refresh-dev-from-prod.sh --yes                 # dev, skip the prompt
#   ./scripts/refresh-dev-from-prod.sh accounting            # one project only
#   ./scripts/refresh-dev-from-prod.sh --target staging      # staging, prompts first
#   ./scripts/refresh-dev-from-prod.sh --target staging --yes reservations
set -euo pipefail

# project label | Neon project id | production branch id | dev branch id | staging branch id
#
# The staging branch ids are filled in when the persistent `staging` branches
# are created (see docs/workflow.md "Staging environment"). Until then, a
# `--target staging` run for a project with an empty id aborts with a clear
# message rather than touching the wrong branch.
PROJECTS=(
  "accounting|nameless-fog-46521987|br-proud-wind-a642mkzo|br-wild-surf-a6w3iro4|"
  "reservations|sweet-tooth-47867008|br-mute-cell-afh5kusc|br-weathered-firefly-afkvvx7g|"
  "identity|flat-tree-08961616|br-patient-water-ajen7oii|br-summer-brook-ajs1uwtt|"
)

ASSUME_YES=0
ONLY=""
TARGET="dev"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y) ASSUME_YES=1 ;;
    --target) TARGET="${2:-}"; shift ;;
    --target=*) TARGET="${1#*=}" ;;
    *) ONLY="$1" ;;
  esac
  shift
done

case "$TARGET" in
  dev|staging) ;;
  *) echo "Unknown --target '$TARGET' (expected: dev | staging)"; exit 1 ;;
esac

command -v pg_dump >/dev/null || { echo "pg_dump not on PATH (see REQUIREMENTS)"; exit 1; }
command -v pg_restore >/dev/null || { echo "pg_restore not on PATH (see REQUIREMENTS)"; exit 1; }

neon() { npx --yes neonctl "$@"; }
conn() { # project_id branch_id -> direct (non-pooled) connection URI
  neon connection-string "$2" --project-id "$1" --database-name neondb 2>/dev/null
}

if [[ "$ASSUME_YES" -ne 1 ]]; then
  echo "This OVERWRITES the $TARGET branch data for: ${ONLY:-all three projects}."
  echo "Each $TARGET branch is snapshotted first. Production is only read."
  read -r -p "Continue? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

STAMP="$(date +%Y-%m-%d-%H%M%S)"

for row in "${PROJECTS[@]}"; do
  IFS='|' read -r label project_id prod_branch dev_branch staging_branch <<<"$row"
  [[ -n "$ONLY" && "$ONLY" != "$label" ]] && continue

  if [[ "$TARGET" == "staging" ]]; then
    target_branch="$staging_branch"
  else
    target_branch="$dev_branch"
  fi

  if [[ -z "$target_branch" ]]; then
    echo ""
    echo "=== $label: no $TARGET branch id configured in PROJECTS — skipping ==="
    echo "    Create the branch (fork of production) and add its id to this script."
    continue
  fi

  echo ""
  echo "=== $label ($project_id) -> $TARGET ==="

  echo "-- snapshotting $TARGET -> backup-$TARGET-$STAMP"
  neon branches create --project-id "$project_id" --parent "$target_branch" \
    --name "backup-$TARGET-$STAMP" >/dev/null

  echo "-- resolving connection strings"
  SRC="$(conn "$project_id" "$prod_branch")"
  DST="$(conn "$project_id" "$target_branch")"
  [[ -n "$SRC" && -n "$DST" ]] || { echo "failed to resolve connection strings"; exit 1; }

  echo "-- copying production -> $TARGET (schema + data)"
  pg_dump -Fc "$SRC" | pg_restore --clean --if-exists --no-owner --no-acl -d "$DST"

  echo "-- done: $label $TARGET now mirrors production"
done

echo ""
echo "All requested projects refreshed. Snapshots preserved as backup-$TARGET-$STAMP."
