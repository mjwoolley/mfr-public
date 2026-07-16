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
>
> - (•) Link to **Jane Miller** — _email matches_ ← preselected when exact
> - ( ) Link to **Janie Miller** — _name looks similar, confirm_
> - ( ) Link to another… [dropdown of unlinked shareholders]
> - ( ) Create new shareholder "Jane Miller" (jane.miller@gmail.com)
> - ( ) No shareholder — reservations-only user
>
> [Cancel] [Approve]

Rules that keep it unconfusing:

- Email match preselects and needs no extra thought; name-only match is shown
  as a suggestion but never preselected (admin must actively pick it).
- Only _unlinked_ shareholders appear as link targets — can't double-link.
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

### 2. Member suggestions / feedback

**Problem.** Members have no in-app way to send an idea, request, or gripe to
the admins. Feedback happens over text/email and gets lost.

**Desired behavior.** A lightweight "Suggest something" box any signed-in member
can reach (e.g. a link in the footer or dashboard). Submitting records the
suggestion with the author and timestamp and notifies the admins; admins see a
list they can read and mark handled/dismissed.

**Sketch (keep it small):**

- New `Suggestion` model (id, author link to identity user, body, createdAt,
  status: `OPEN` / `HANDLED` / `DISMISSED`, optional admin note). Lives in the
  accounting DB alongside the rest of the domain data.
- Member side: a short form (textarea + submit) behind the normal shareholder
  auth gate; confirmation toast on submit. No editing after send — keep it
  append-only.
- Admin side: a simple list under Admin with status controls, newest first.
  Reuse the existing email helper to notify admins on new submissions.

**Open questions:** where the entry point lives (footer vs dashboard card);
whether non-shareholder portal users can submit too; whether to allow optional
categories/tags or keep it a single free-text field to start.

### 3. Google Chat integration (or a link to it)

**Problem.** The family coordinates in a Google Chat space, but there's no path
to it from the portal — members have to know it exists and find it themselves.

**Desired behavior.** Bring the conversation into reach from the site. Start
with the cheap version and only go deeper if it's worth it:

- **Minimum:** a clearly-placed link (nav/footer/dashboard) that opens the
  family Google Chat space in a new tab. Config-driven (space URL in an env
  var / admin setting), no API.
- **Nicer, later:** show unread/activity hints or post portal events
  (new contribution recorded, reservation booked) into the space via a Chat
  webhook or the Google Chat API.

**Open questions:** one shared space vs per-topic; whether deep integration is
worth the OAuth/API scope cost versus just a link; who administers the space.

### 4. Member photo gallery (in-site uploads) — future

**Shipped (portal `/photos`):** the config-driven link version — a per-year grid
of Google Photos album links (managed in Admin) plus a home-page highlights album
link and slideshow. What remains is the full in-site gallery below.

**Problem.** Reunion and lake-house photos live scattered across people's
phones and a shared Google Photos album; the links are one click away now, but
there's still no in-site gallery members can contribute to directly.

**Desired behavior (remaining):**

- **Full feature:** an in-site **photo gallery members can upload to**. Signed-in
  members upload photos; everyone can browse them in a gallery/grid with
  lightbox view. Consider a captions field and sort-by-date.

**Sketch (for the full gallery):**

- Storage: use a blob store (e.g. Vercel Blob) for the image files; keep a
  `Photo` model (id, uploader link to identity user, blob URL, caption,
  takenAt/uploadedAt) in the DB for metadata and ordering. Generate/store a
  thumbnail size to keep the grid fast.
- Upload flow behind the shareholder auth gate; validate type/size; strip or
  respect EXIF orientation. Append-only to start (no edits); uploader or admin
  can delete.
- Optionally sync with a shared Google Photos album via its API instead of (or
  in addition to) self-hosting — decide based on how much control vs.
  convenience the family wants.

**Open questions:** self-host uploads vs. lean entirely on a Google Photos
album; moderation (any review before a photo appears?); storage cost/limits;
whether albums/tags are needed or one flat gallery is enough to start.

### 5. Online staging environment — remaining one-time console setup

Repo + most infra are done. **Done:** env-driven cross-app URLs,
`ADDITIONAL_ALLOWED_ORIGINS`, distinct staging session cookie,
`refresh-dev-from-prod.sh --target staging`, the full
[workflow.md](workflow.md#staging-environment-test-the-deployed-site) write-up;
the three Neon `staging` branches (forked from prod, IDs in the refresh script);
the long-lived `staging` git branch; the staging env-var set on all three Vercel
projects (Preview → `staging`); the per-project Ignored Build Step updated to
build the `staging` branch. All three staging previews build green.

**What's left (needs Google / DNS / Vercel-dashboard access) — delete this item
once staging is live and end-to-end tested:**

- **Google OAuth:** add the three staging redirect URIs + JS origins to the OAuth
  client (exact URIs in workflow.md → Staging environment).
- **DNS + Vercel domains:** point `staging`, `reservations.staging`,
  `accounting.staging` (under millerfamilyreunions.org) at Vercel and assign each
  to its project's `staging` branch.
- **Then verify:** sign in on staging, SSO across the three subdomains, cross-app
  links stay on staging, a triggered email lands at `EMAIL_OVERRIDE_TO`, prod data
  untouched. (Optional: relax Vercel Deployment Protection if the family needs
  direct access — today the staging URLs require a Vercel login.)

## Defects

_(nothing tracked yet — add items here as they're found)_

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
