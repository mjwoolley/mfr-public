# Backlog — future features & defects

A running list of ideas and known problems, roughly ordered by priority within
each section. When an item ships, delete it (git history remembers). Bigger
items get a short design sketch here before implementation so context isn't
lost between sessions.

## Features

### 1. Automatic shareholder linking follow-ups

Most of the original "approve → shareholder in one step" item shipped: a new
signup is auto-linked and auto-approved when its email matches a Shareholder,
the admins are emailed (and texted) when it doesn't, and Admin → Shareholders
grew a Link button that suggests logins by name. What's left:

- **Create a Shareholder from the approval screen.** Approving at
  `/admin/users` still can't mint a shareholder record for someone who has
  none; an admin has to visit Accounting → Admin → Shareholders afterwards.
- **A banner for approved users with no shareholder link**, so the ones who
  predate the auto-link (or were deliberately skipped) are visible rather than
  discovered by complaint.
- **Record when the by-email auto-link fires**, so a link is never mysterious.
  `handleNewSignup` writes a `user_auto_approved` activity row, but the
  `extendSession` link at sign-in still happens silently.

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
  (new share purchase recorded, reservation booked) into the space via a Chat
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

### Contribution → share purchase: internal names still say "contribution"

The user-facing rename shipped, but the DB enum value (`CONTRIBUTION`), the
`ContributionGoal` table, the `/accounting/contributions` route, the public
`/accounting/api/contributions/current-year` endpoint and the matching TS
symbols still carry the old word. Deliberate — renaming the enum rewrites the
`type` column on every real row, a table rename is a drop/create away from
disaster in CI, and the route is referenced by five `revalidatePath` calls plus
the e2e suite. Worth doing only as its own PR, and the route rename is cheap and
precedented (`app/accounting/activity/page.tsx` is exactly such a leftover
redirect stub).

Note `lib/accounting/expenseChart.ts` is now the one place that still reads a
share count as a dollar amount — it charts money in vs money out, where the
$1 = 1 share rule makes them identical. If that ratio ever changes, start there.

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
