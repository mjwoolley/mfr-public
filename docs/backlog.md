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

### 2. Member Feedback

**Problem.** Members have no in-app way to send an idea, request, complaint or
bug report to the admins. Feedback happens over text or email and gets lost.

**Specified behavior.** Approved members get a small floating Feedback control
on every portal page. One plain-text message creates a labeled Task on the
existing Jira board, then MFR sends the member and site admins email updates.
Jira is the system of record; no Feedback table or Admin list is added to MFR.

The full design, including Jira project `KAN`, status notifications, failure
behavior and security checks, is [CAP-048](../requirements/portal/member-feedback.md).

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

### Restore sharp 0.35.x (reverted to 0.34.5 to end an upload outage)

From 2026-07-22 until the revert, **every** gallery upload failed for **every**
member. PR #70 bumped sharp 0.34.5 → 0.35.3 for libvips CVEs; in the Vercel
runtime 0.35.3 does not load `@img/sharp-linux-x64` and silently retries
`@img/sharp-wasm32` (0.34.5 fails loudly instead). The WASM build allocates a
_shared_ WebAssembly memory, so its Buffers are SharedArrayBuffer-backed and
`fetch` rejects them — `TypeError: ArrayBuffer: SharedArrayBuffer is not
allowed` — which killed the Blob upload inside `finalizeUpload`.

Reverting reopens GHSA-f88m-g3jw-g9cj. To close it, first find out **why** the
native binary is rejected under 0.35.3: the loader either fails the
`_isUsingX64V2()` microarchitecture gate or can't load the module at all.

**The diagnostic now exists.** `GET /api/health/image` (secret-gated with the
same Bearer `CRON_SECRET` as `/api/health`; logic in
`lib/photos/imageDiagnostics.ts`) reports, from inside the deployed runtime:
whether each `@img/*` package resolves on disk, `sharp.versions`,
`sharp._isUsingX64V2()`, the CPU's x86-64-v2 feature flags, the runtime glibc
version, and a live 8×8 encode that says whether the bytes came back
SharedArrayBuffer-backed. The **Prod probe (manual)** workflow dumps it into the
job summary.

**How to settle it:**

1. Open a throwaway branch bumping sharp to 0.35.3 and let Vercel build its
   preview (same runtime as production, no production risk).
2. Run **Prod probe (manual)** with `base` set to that preview URL. Note that
   `CRON_SECRET` must exist in Vercel's _Preview_ environment for the step to
   report anything — the workflow passes `CRON_SECRET_PROD` and skips cleanly
   when there's no value.
3. Read `sharp.encode.value.verdict`. `"wasm fallback in use"` reproduces the
   outage. Then:
   - `packages["@img/sharp-linux-x64"].ok === false` → the binary never made it
     into the deployed bundle. A **tracing/bundling** problem
     (`outputFileTracingIncludes`, optional-dependency install).
   - package present but `cpu.missingX64V2Flags` non-empty → sharp's
     microarchitecture gate is rejecting Vercel's CPU. A **sharp/loader**
     problem; take it upstream.
   - both fine but still wasm → look at `sharp.loadError` and glibc.

Running it against production (0.34.5) gives the healthy baseline to compare
against. Once the cause is fixed, **remove the `sharp` entry from the `ignore`
list in `.github/dependabot.yml`** — it's suppressing the security PRs for this
advisory and would otherwise hide the eventual real fix.

`unshare()` in `lib/photos/imageProcess.ts` now copies shared-backed bytes and
logs a warning, so the fallback degrades to slow rather than fatal — that warning
in the logs is the signal the native binary stopped loading.

### Email can stop working and nothing would notice

**The gap.** Email logic is well covered — `accounting-integration/emails.test.ts`,
`reservations-integration/notifications.test.ts`, and the `resolveRecipient`
unit tests all pass. But `EMAIL_ENABLED=true` only in production, so **no test
anywhere performs a real SES send**. Reservation confirmations, signup alerts and
approval notices are fire-and-forget: nobody is waiting on them, so if SES stops
working the first signal is a family member saying "I never got that."

**Why it fails silently.** `sendEmail` in `lib/accounting/email.ts` (and its twin
in `lib/reservations/email.ts`) ends with:

```js
} catch (error) {
  console.error('Failed to send email:', error)
}
```

Every failure is swallowed. Callers believe the send succeeded, no test can
assert on it, and the only trace is a Vercel log line nobody reads. Fix this
first — monitoring layered on top of a discarded error only tells you afterwards.

**Plan, cheapest first. Each stands alone; stop wherever the value runs out.**

1. **Make failures visible.** Have `sendEmail` return a result (`{ sent: true }` /
   `{ sent: false, error }`) instead of returning `undefined` either way. Callers
   that can surface it should; the rest should at minimum log at error level with
   a stable, greppable prefix. Cheap, and it is what makes everything below
   testable.

2. **Add an SES check to `/api/health`.** Two read-only SESv2 calls, no mail sent,
   alongside the existing DB and R2 probes — so the production smoke
   picks it up for free:
   - `GetAccountCommand` → assert `SendingEnabled === true` and `EnforcementStatus`
     is healthy (catches a paused or sandboxed account, rotated or wrong
     credentials, wrong `SES_REGION`).
   - `GetEmailIdentityCommand` for the sender domain → assert
     `VerifiedForSendingStatus === true` and DKIM `Status === 'SUCCESS'` (catches
     lapsed domain verification and failed DKIM rotation).

   Non-critical, like the R2 probe: it must alert, never auto-roll-back — a
   rollback cannot fix an expired AWS key.

3. **Exercise a real send against the SES mailbox simulator.** Send to
   `success@simulation.amazonses.com`, which SES accepts and discards without
   touching deliverability or reputation. That runs the whole path — credentials,
   identity, `SendEmailCommand`, and React template rendering, which is its own
   failure mode — with no real inbox involved. Belongs in the preview smoke
   (`preview-smoke.yml`), where writes are already acceptable.

4. **Deliverability, if it ever matters.** Steps 1–3 prove "SES accepted it", not
   "it reached an inbox". Only bounce/complaint tracking closes that: SES event
   destinations → SNS, or the built-in reputation dashboard alarms. Configuration
   rather than code, and worth doing only if mail actually starts going astray.

Steps 1 and 2 are the high-value pair. Step 3 is a nice-to-have. Step 4 is
speculative — do not build it pre-emptively.

### The production smoke session token is copied into every forked branch

A session token _is_ the credential — `sessions.session_token` is the value the
cookie carries, stored in plaintext. The smoke identity is seeded into
`production`, so **every branch forked from it inherits that row**: each PR's
preview database, each ephemeral `ci-*` branch, and any dev branch re-forked from
prod. Anyone who can read one of those databases can read the live
`SMOKE_SESSION_TOKEN_PROD` and sign in to millerfamilyreunions.org as the smoke
user.

The blast radius is small on purpose — the smoke identity is a plain approved
member with no portal role, which is the least-privilege design in
`scripts/seed-smoke-user.mjs` paying off — and branch access is limited to the
project owner and the deploys. But the value is more widely copied than "it's a
GitHub secret" implies, and it never expires (the seeded row runs to 2035).

Fix: stop inheriting it. Have each forked branch delete the inherited smoke
session on creation and seed its own token, so the prod credential exists only in
prod. CI already runs `seed-smoke-user.mjs`-style setup per branch, so the shape
exists; the missing half is a `DELETE FROM sessions WHERE user_id = <smoke id>`
on fork, plus a per-branch token rather than the prod secret. Rotate
`SMOKE_SESSION_TOKEN_PROD` when this lands.

### Sweep orphaned `gallery-tmp/` blobs

`finalizeUpload` deletes the temp original on success and on a processing
failure, but not when the store/insert step fails (deliberately — it is then the
only surviving copy) or when it never runs at all: a function timeout, or the
member closing the tab mid-batch. Those blobs are left with no row pointing at
them and nothing ever collects them.

Invisible to members (orphans aren't in any gallery query) but it accumulates
storage. Worth a sweep in the existing daily `photo-backup` cron: delete
`gallery-tmp/*` objects older than ~24h. That prefix is only ever a staging area,
so age alone is a safe signal. Would also give a countable signal for how often
finalize is failing — currently there is none. Pair it with
`apps/mfr/scripts/recover-orphaned-uploads.ts`, which recovers orphans rather
than discarding them; sweep only what that has already had a chance at.

Related: large HEICs are decoded by pure-JS `heic-convert`, and
`apps/mfr/vercel.json` sets no `maxDuration`, so a big batch may be running close
to the default function timeout. This was _not_ the cause of the 2026-07-22
outage, but it remains the slowest path in the app and is worth measuring.

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

### Dependency advisories: standing triage

The `npm audit` CI job was removed (2026-08-01). It was advisory-only — never
part of `ci-ok`, so it never blocked a merge — but it went red on _every_ PR for
advisories nobody could act on, and a permanently-red check just teaches you to
ignore red.

All six open Dependabot alerts at the time were pinned by a parent we don't
control, and none of them reaches the served app. Every one survives
`npm audit fix` (which would also add ~170 packages):

| Package           | Sev         | Reached via                                   | Why it's parked                                                                                                               |
| ----------------- | ----------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `postcss` ×3      | high×2, mod | `next`'s bundled copy                         | next pins postcss 8.4.31. Build-time CSS processing, not served code. Unblocks when Next ships a release on postcss ≥ 8.5.18. |
| `brace-expansion` | high        | `minimatch@3` ← `eslint`                      | Needs eslint to move off minimatch 3.x. Lint tooling only.                                                                    |
| `esbuild`         | mod         | `@esbuild-kit/core-utils` ← `drizzle-kit`     | Advisory is about `esbuild serve`, which we never run. That package is deprecated; unblocks when drizzle-kit moves to tsx.    |
| `qs`              | mod         | `typed-rest-client` ← `@stryker-mutator/core` | Mutation testing, weekly CI only. Unblocks when Stryker updates.                                                              |

Forcing any of these (`npm audit fix --force`, or `overrides`) means overriding
a version a tool pins on purpose, risking the toolchain for no user-facing gain.

**What to actually do:** watch the Dependabot alerts in the Security tab, and
when a Next bump lands (or any of the parents above updates), re-check whether
the corresponding alert clears. If a _new_ advisory ever appears on a package we
genuinely ship and run, that is worth acting on immediately — the reason this
list is safe to park is that none of these are that.

Note Dependabot's _security_ update runs currently fail for `postcss` and
`brace-expansion` for exactly the reason above — it can't construct a fix. Its
routine version updates still work.

### Strengthen weak-assertion tests found by mutation testing (2026-08-08)

The first successful mutation sweep after the PR #107 repair scored apps/mfr at
83.0% covered (mutants the unit tests exercise and kill). Most survivors are
noise, but one is not:

- **`lib/reservations/auth/portalStatusGate.ts` — 20% (4 of 5 mutants
  survive).** This is an auth gate: the tests execute it but would not notice
  if its logic inverted. Highest-value test to strengthen in the repo.
- Lesser cases, worth a pass if touching the area anyway:
  `lib/accounting/authz.ts` 63.6%, `lib/photos/backupStore.ts` 63.3%,
  `lib/photos/imageProcess.ts` 68.2%, `lib/drive/client.ts` 72.3% (52
  survivors).

Read survivors per file in the weekly `mutation.yml` artifact
(`mutation-report-mfr` → `mutation.html`); each lists the exact mutation and
the tests that ran without failing.

### Decide whether the mutation sweep should see the integration suites

The headline mutation score (55.4% total) is an artifact, not a verdict: 827 of
2,488 mutants report `NoCoverage` because Stryker runs the **unit** config only
(`vitest.stryker.config.ts`), so anything covered exclusively by the
integration suites counts as uncovered — all four `app/**/actions.ts` score 0%
there despite 100% line coverage. The `covered` column (83.0%) is the honest
number today.

Making `total` honest means giving `mutation.yml` database credentials +
per-run Neon branches, which its header deliberately avoids ("no database
secrets are needed") — and a mutation run executes the suite hundreds of times,
so an integration-backed sweep is also a runtime/cost question, likely needing
`--since`-style scoping. Decide deliberately; until then, read `covered`, not
`total` (workflow.md documents this).

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
