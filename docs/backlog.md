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

### 4. Member photo gallery (in-site uploads) — SHIPPED

The in-site gallery is built (see `docs/photos-design.md` → "Member photo
gallery"): approved members add photos on `/photos` (Albums), which groups the
one photo list By Year or By Uploader, and feature up to 5 of their own photos
onto the home page. Uploads stream client-direct to Vercel Blob, are normalized
server-side (HEIC→JPEG, EXIF/GPS stripped, downscaled), and are mirrored to a
Cloudflare R2 backup with a 30-day delete-recovery window (daily cron).

Google's album-read API was removed in March 2025, so the Google Photos link
version and this self-hosted gallery coexist rather than sync.

**Follow-ups (optional):** retire the admin slide uploader once the gallery is
populated (source the home hero from featured photos and album-card rotations
from each year's photos); photo search/tags; per-photo comments; video.

## Defects

### Server logs `TypeError: Cannot read properties of null (reading 'user')`

A server-rendered component reads `session.user` without a null-guard on an
unauthenticated request path (seen in e2e webserver logs, digest `1874081621`,
before signed-out redirect flows). Non-fatal — the request still resolves to the
expected redirect/error boundary and all e2e pass — but it should be guarded so
the log is clean and there's no latent crash if the redirect ever changes. Track
down which page/component (likely a reservations or portal route rendering under
a redirect) and add the null check.

## Chores

### Speed up the integration CI job (matrix-shard by suite)

The `Integration tests + coverage` job runs ~4.5 min, ~218s of it the tests
themselves. All three integration suites (portal, accounting, reservations)
share one Neon `test` branch and two are `fileParallelism: false` (they mutate
singleton rows — `portal_settings`, `booking_rules` — that would race). Split
the job into a 3-leg matrix (one suite per leg), each provisioning its **own**
ephemeral Neon branch, so the legs run fully in parallel and each isolated leg
can drop `fileParallelism: false`. Expect wall-clock ~218s → ~slowest single
suite (~90–120s). CI jobs already run in parallel; this shortens the long pole.

### Standardize on Node 24 across the stack

`.nvmrc` pins 22 (CI + Vercel build image follow it) but local dev defaults to
node 24, which is what produced a mismatched `package-lock.json` (node 22's npm
10 vs node 24's npm 11 resolve the `@napi-rs/wasm-runtime`→`@emnapi/*` optional
subtree differently, so `npm ci` rejected the lock). Options: bump `.nvmrc` →
`24` (local/CI/Vercel all agree on what devs actually run) — needs a Vercel
build-runtime re-verify, so its own PR. (An nvm auto-switch hook is already in
`~/.zshrc` so the repo selects 22 automatically until then.)

### Delete stale Neon backup branches (mfr-accounting)

Copy-on-write snapshots taken right before each production write on 2026-07-12/13.
Safe to delete once the imported shareholder data is confirmed correct in the live app.
Project `nameless-fog-46521987`.

**Do NOT delete — live/working branches:** `production` (`br-proud-wind-a642mkzo`),
`test` (`br-soft-river-a6nrmqkb`), `dev` (`br-wild-surf-a6w3iro4`, the default branch),
and the permanent gold copy `gold-2026-07-13-full-history` (`br-spring-forest-a6dbuc8q`) —
snapshot of production taken 2026-07-13 after the full contributions + expenses history import.

Backup branches to delete:

- `backup-2026-07-12-pre-2025-contribs` — `br-sweet-dream-a6ainqpt`
- `backup-pre-fy2026-import` — `br-divine-sea-a66xi8l9`
- `backup-pre-fy2022-import` — `br-cool-smoke-a6o2w81s`
- `backup-2026-07-12-pre-fy2026-contribs` — `br-morning-credit-a6rn27ju`
- `backup-pre-fy2025-import` — `br-nameless-lab-a63u9jh0`
- `backup-2026-07-12-pre-fy2024-detail` — `br-weathered-lake-a6oezehk`
- `backup-pre-fy2021-import` — `br-muddy-cake-a69zz297`
