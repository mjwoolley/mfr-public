#!/usr/bin/env bash
# SessionStart hook: flag worktrees and local branches whose work has already
# merged into main, so leftover PR debris gets noticed (and removed) instead of
# accumulating. Read-only — it never deletes anything itself.
#
# A branch is "done" if it's `--merged main` OR its upstream is `[gone]`. Both
# checks are kept, because each catches what the other misses:
#
#   --merged  PRs here land as MERGE COMMITS (docs/workflow.md: "never squash or
#             rebase-merge", and the repo has allow_squash_merge disabled), so a
#             merged branch IS an ancestor of main and this check is reliable.
#             It is the primary signal.
#   [gone]    GitHub has delete_branch_on_merge enabled, so merging removes the
#             remote branch; after pruning stale remote-tracking refs the local
#             branch's upstream reads `[gone]`. This still catches branches that
#             predate the merge-commit policy (older PRs were squash-merged, and
#             a squashed branch never becomes an ancestor of main).
#
# Note `[gone]` deliberately does NOT fire for a PR closed without merging —
# auto-delete only runs on merge — so a closed-unmerged branch keeps its
# upstream, fails both checks, and is correctly left alone. It may still hold
# the only copy of that work.
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
# Recommend `-d`, not `-D`: with merge commits a genuinely merged branch deletes
# cleanly, and `-d` REFUSES anything still holding unique commits — which is the
# check you want, not one to override. A branch flagged only by `[gone]` (an old
# squash-merge) may need `-D`; confirm with `git log main..<branch>` first.
msg="${msg} If no uncommitted work remains, clean up with 'git worktree remove <path>' / 'git branch -d <name>'. If -d refuses, the branch still has commits not in main — check 'git log main..<branch>' before reaching for -D."

esc=$(printf '%s' "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{"systemMessage": "%s", "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "%s"}}\n' "$esc" "$esc"
