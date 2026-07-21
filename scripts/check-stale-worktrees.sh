#!/usr/bin/env bash
# SessionStart hook: flag worktrees and local branches whose work has already
# merged into main, so leftover PR debris gets noticed (and removed) instead of
# accumulating. Read-only — it never deletes anything itself.
#
# PRs here are SQUASH-merged, so a merged branch's commits never become
# ancestors of main and `git branch --merged` misses them. GitHub deletes the
# remote branch on merge, though, so after pruning stale remote-tracking refs a
# merged branch's upstream shows `[gone]`. We treat a branch as done if it's
# `--merged main` (classic merge / local ff) OR its upstream is `[gone]`.
#
# Kept POSIX/bash-3.2 compatible (macOS default bash) — no associative arrays.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)" 2>/dev/null || exit 0

main_ref="main"
git rev-parse --verify -q "$main_ref" >/dev/null || exit 0

# Reflect deleted remote branches as [gone] upstreams. Best-effort: needs the
# network, but offline just degrades to the --merged check below (never fails).
git remote prune origin >/dev/null 2>&1 || true

# Newline-delimited set of "done" branch names.
done_branches=""
add_done() {
  case "$1" in main | "") return ;; esac
  printf '%s\n' "$done_branches" | grep -qxF -- "$1" && return
  done_branches="${done_branches}$1
"
}
while IFS= read -r b; do add_done "$b"; done \
  < <(git branch --merged "$main_ref" --format='%(refname:short)')
# NOTE: no `IFS=` here — we WANT to split "name  [track]" into two fields.
while read -r name track; do
  case "$track" in *"[gone]"*) add_done "$name" ;; esac
done < <(git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads)

is_done() { printf '%s\n' "$done_branches" | grep -qxF -- "$1"; }

# Worktrees: flag a non-primary, unlocked worktree whose branch is done, and
# remember checked-out branches so they aren't also reported as loose branches.
wt_branches=""
stale_worktrees=""
self_toplevel="$(git rev-parse --show-toplevel)"
path=""; branch=""; locked=0
flush() {
  if [ -n "$path" ]; then
    [ -n "$branch" ] && wt_branches="${wt_branches}${branch}
"
    if [ "$locked" -eq 0 ] && [ "$path" != "$self_toplevel" ] && [ -n "$branch" ] && is_done "$branch"; then
      stale_worktrees="${stale_worktrees}${path} (${branch}); "
    fi
  fi
  path=""; branch=""; locked=0
}
while IFS= read -r line; do
  case "$line" in
    worktree\ *) flush; path="${line#worktree }" ;;
    branch\ refs/heads/*) branch="${line#branch refs/heads/}" ;;
    locked*) locked=1 ;;
    "") ;;
  esac
done < <(git worktree list --porcelain)
flush

# Loose branches: done branches not checked out in any worktree.
stale_branches=""
while IFS= read -r b; do
  [ -z "$b" ] && continue
  printf '%s\n' "$wt_branches" | grep -qxF -- "$b" && continue
  stale_branches="${stale_branches}${b}, "
done < <(printf '%s\n' "$done_branches" | sort -u)

[ -z "$stale_worktrees" ] && [ -z "$stale_branches" ] && exit 0

msg="Stale (already merged into main):"
[ -n "$stale_worktrees" ] && msg="${msg} worktrees: ${stale_worktrees%; }."
[ -n "$stale_branches" ] && msg="${msg} branches: ${stale_branches%, }."
msg="${msg} If no uncommitted work remains, clean up with 'git worktree remove <path>' / 'git branch -D <name>' (squash-merged branches aren't 'fully merged', so -D not -d)."

esc=$(printf '%s' "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{"systemMessage": "%s", "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "%s"}}\n' "$esc" "$esc"
