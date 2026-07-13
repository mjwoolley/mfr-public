# Backlog — future features & defects

A running list of ideas and known problems, roughly ordered by priority within
each section. When an item ships, delete it (git history remembers). Bigger
items get a short design sketch here before implementation so context isn't
lost between sessions.

## Features

### 1. Centralized user administration (approve → shareholder in one step)

**Problem.** Bringing a new family member onto the portal is a two-place,
two-step chore that's easy to half-finish:

1. They sign in with Google → land in `pending`, and the admin approves them
   at `/reservations/admin/users` (the shared portal-status gate).
2. Separately, on the accounting side, a Shareholder profile must exist and be
   linked. Today the link only happens automatically on the member's first
   sign-in, and only when the Shareholder row's email exactly matches their
   Google email (`extendSession` hook sets `Shareholder.userId`). If the
   shareholder record has no email or a different one, nothing links and
   nobody is told.

**Desired behavior.** Approving a user finishes the whole job:

- If a Shareholder with a matching **email** exists → link it automatically.
- Else if a Shareholder with a matching **name** exists (case/whitespace
  insensitive) → propose the link, admin confirms.
- Else → offer to create a new Shareholder profile (or explicitly skip for
  reservations-only users).

**Proposed UX (one screen, no new concepts).** Keep approval where the admin
already does it, but make the Approve action a small dialog instead of a bare
button:

> **Approve Jane Miller** (jane.miller@gmail.com)
>
> Shareholder profile — pick one:
> - (•) Link to **Jane Miller** — *email matches* ← preselected when exact
> - ( ) Link to **Janie Miller** — *name looks similar, confirm*
> - ( ) Link to another… [dropdown of unlinked shareholders]
> - ( ) Create new shareholder "Jane Miller" (jane.miller@gmail.com)
> - ( ) No shareholder — reservations-only user
>
> [Cancel] [Approve]

Rules that keep it unconfusing:

- Email match preselects and needs no extra thought; name-only match is shown
  as a suggestion but never preselected (admin must actively pick it).
- Only *unlinked* shareholders appear as link targets — can't double-link.
- Linking fills in the Shareholder's missing email from the Google account,
  so the next person's match is better than the last.
- Safety net: accounting Admin → Shareholders shows a banner for approved
  users with no shareholder link (catches "skipped" or pre-feature users),
  with the same dialog available to fix each one.

**Open questions / design decisions to make first:**

- Cross-database write: approval happens in the reservations app, but
  Shareholder rows live in the accounting DB (separate Neon projects). Either
  the reservations app gets the accounting DB URL + a small shared data
  module, or accounting exposes an internal server action/API that the
  approval flow calls. (The existing cross-app precedent is the shared
  identity DB; per-app business DBs have never crossed.)
- Where should the approval UI ultimately live? Short-term: keep at
  `/reservations/admin/users`. Long-term maybe a shared "People" admin on the
  apex app that manages portal status + shareholder link + admin flags in one
  place.
- The existing `extendSession` email-match auto-link stays as a fallback but
  should probably record/log when it fires so links are never mysterious.

## Defects

*(nothing tracked yet — add items here as they're found)*

## Chores

### Delete stale Neon backup branches (mfr-accounting)

Copy-on-write snapshots taken right before each production write on 2026-07-12/13.
Safe to delete once the imported shareholder data is confirmed correct in the live app.
Project `nameless-fog-46521987`.

**Do NOT delete — live/working branches:** `production` (`br-proud-wind-a642mkzo`),
`test` (`br-soft-river-a6nrmqkb`), `dev` (`br-wild-surf-a6w3iro4`, the default branch).

Backup branches to delete:
- `backup-2026-07-12-pre-2025-contribs` — `br-sweet-dream-a6ainqpt`
- `backup-pre-fy2026-import` — `br-divine-sea-a66xi8l9`
- `backup-pre-fy2022-import` — `br-cool-smoke-a6o2w81s`
- `backup-2026-07-12-pre-fy2026-contribs` — `br-morning-credit-a6rn27ju`
- `backup-pre-fy2025-import` — `br-nameless-lab-a63u9jh0`
- `backup-2026-07-12-pre-fy2024-detail` — `br-weathered-lake-a6oezehk`
- `backup-pre-fy2021-import` — `br-muddy-cake-a69zz297`
