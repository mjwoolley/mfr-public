#!/usr/bin/env bash
# SessionStart hook: flag worktrees and local branches whose work has already
# merged into main, so leftover PR debris gets noticed (and removed) instead of
# accumulating. Read-only — it never deletes anything itself.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)" 2>/dev/null || exit 0

main_ref="main"
git rev-parse --verify -q "$main_ref" >/dev/null || exit 0

stale_worktrees=()
# Porcelain blocks are separated by blank lines; a block is stale when the
# worktree is not locked (locked = live session), is not the main checkout,
# and its HEAD is already an ancestor of main.
current=""
head=""
locked=0
flush() {
  if [[ -n "$current" && "$locked" -eq 0 && "$current" != "$(git rev-parse --show-toplevel)" ]]; then
    if [[ -n "$head" ]] && git merge-base --is-ancestor "$head" "$main_ref" 2>/dev/null; then
      stale_worktrees+=("$current")
    fi
  fi
  current=""; head=""; locked=0
}
while IFS= read -r line; do
  case "$line" in
    worktree\ *) flush; current="${line#worktree }" ;;
    HEAD\ *) head="${line#HEAD }" ;;
    locked*) locked=1 ;;
    "") ;;
  esac
done < <(git worktree list --porcelain)
flush

# Local branches merged into main, excluding main/staging and any branch
# checked out in a worktree (git prefixes those with + or *).
stale_branches=()
while IFS= read -r b; do
  [[ "$b" == "main" || "$b" == "staging" ]] && continue
  stale_branches+=("$b")
done < <(git branch --merged "$main_ref" --format='%(if)%(worktreepath)%(then)%(else)%(refname:short)%(end)' | sed '/^$/d')

[[ ${#stale_worktrees[@]} -eq 0 && ${#stale_branches[@]} -eq 0 ]] && exit 0

msg="Stale (already merged into main):"
[[ ${#stale_worktrees[@]} -gt 0 ]] && msg+=" worktrees: ${stale_worktrees[*]}."
[[ ${#stale_branches[@]} -gt 0 ]] && msg+=" branches: ${stale_branches[*]}."
msg+=" If no uncommitted work remains, clean up with 'git worktree remove <path>' / 'git branch -d <name>'."

# JSON-escape is trivial here (paths/branch names — no quotes/backslashes
# expected), but escape defensively anyway.
esc=$(printf '%s' "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{"systemMessage": "%s", "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "%s"}}\n' "$esc" "$esc"
