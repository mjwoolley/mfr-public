# Phase 7 — Cutover runbook (live steps)

The whole merge is code-complete and verified (build + 400 unit/integration +
43 e2e, all green). The **data cutover into the new production branch is already
done and verified** (see "Done" below). What remains are the Vercel + DNS steps,
which need your access.

## Already done (non-destructive prep)

- Unified Neon project **`mfr`** = `lucky-butterfly-29223414`; branch
  **`production`** = `br-old-block-ajjs5915`.
- Drizzle schema pushed to `production` + push-only objects applied.
- **Real prod data migrated** from the 4 old prod branches into `production`
  and **verified byte-identical**: accounting fingerprint + all 7 table content
  hashes match old accounting-prod exactly (25 SH / 303 contrib / 18 transfer /
  144 expenses / $136,624.97 / 376,019.92 shares); reservations 23, activity 56,
  users 2, portal_settings 1.
- **The 4 old Neon projects + 3 old Vercel projects are untouched** — full
  rollback until you verify the live site.

## 1. Create ONE Vercel project

- New project from this repo, **Root Directory = `apps/mfr`**, framework Next.js.
  (Or repurpose the existing `mfr_web` project by changing its root dir to
  `apps/mfr` and renaming — either works.)
- Build command default (`next build`); install `npm ci` at repo root (workspaces).
- Attach the apex domain **`millerfamilyreunions.org`** (and `www`).

## 2. Production env vars (Vercel → Settings → Environment Variables, Production)

Copy the connection strings from the Neon console for project `mfr`, branch
`production` (br-old-block-ajjs5915) — do NOT paste secrets into git:

| Var                                     | Value                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                          | `production` branch **pooled** URL (host `ep-soft-silence-aj91no6e-pooler…`)                                                               |
| `DIRECT_URL`                            | `production` branch **direct** URL (host `ep-soft-silence-aj91no6e…`, no `-pooler`) — only used for `db:push`                              |
| `AUTH_SECRET`                           | the existing production AUTH_SECRET (reuse — database sessions)                                                                            |
| `AUTH_URL`                              | `https://millerfamilyreunions.org/api/auth`                                                                                                |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | existing Google OAuth client (unchanged)                                                                                                   |
| Email (carry over from old projects)    | `EMAIL_ENABLED=true`, `EMAIL_FROM`, `SES_REGION`, `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY` (and `EMAIL_OVERRIDE_TO` only for non-prod) |

Do NOT set the retired vars: `IDENTITY_DATABASE_URL`, `PORTAL_DATABASE_URL`,
per-app `DATABASE_URL`, `AUTH_COOKIE_DOMAIN`, `AUTH_SESSION_COOKIE_NAME`,
`NEXT_PUBLIC_*_URL`, `ACCOUNTING_BYPASS_SECRET`, `ADDITIONAL_ALLOWED_ORIGINS`.

## 3. Google OAuth

Add the new redirect URI to the Google OAuth client:
`https://millerfamilyreunions.org/api/auth/callback/google`
(the old per-subdomain callback URIs can be removed after cutover).

## 4. CI secret

CI's integration/e2e jobs create ephemeral branches on the `mfr` project. The
`NEON_API_KEY` secret already exists; the project id `lucky-butterfly-29223414`
is inlined in `.github/workflows/ci.yml` (env). Confirm it, or move to a
`NEON_PROJECT_ID_MFR` secret.

## 5. Deploy + domain flip

1. Merge `worktree-single-app-merge` → `main` (this repo auto-deploys `main`).
   **Before merging**, make sure the OLD three Vercel projects will NOT also
   redeploy from `main` and fight for the domain — either disconnect their Git
   integration or delete them (step 7). The new project should own the apex.
2. Point `millerfamilyreunions.org` DNS at the new Vercel project.
3. **301-redirect** the old subdomains to the merged paths (Vercel domain
   redirects or a small config): `reservations.millerfamilyreunions.org/*` →
   `https://millerfamilyreunions.org/reservations/*`;
   `accounting.millerfamilyreunions.org/*` → `…/accounting/*`.

## 6. Live smoke (before decommissioning anything)

- Home renders; primary nav (Home / Reservations / Accounting / Photos / Meals /
  Documents / Admin) + each section's sub-tab row.
- **One Google sign-in** works and reaches all three sections; **one sign-out**
  revokes everywhere.
- Accounting dashboard shows the real numbers (25 shareholders, $136,624.97
  expenses, current-year contributions); reservations calendar loads.
- Create a test reservation (then cancel) to confirm the GiST overlap
  constraint + writes work; confirm an admin action.
- Old subdomains 301 to the new paths.

## 7. Decommission (ONLY after live smoke passes)

- Delete the 3 old Vercel projects (`mfr_reservations`, `mfr_accounting`, and
  the old `mfr_web` if you made a fresh project).
- Delete the 4 old Neon projects (identity `flat-tree-08961616`, portal
  `icy-breeze-74614724`, reservations `sweet-tooth-47867008`, accounting
  `nameless-fog-46521987`) — and the `backup-*-2026-07-17` branches + the
  `~/mfr-backups/2026-07-17-premerge/` dumps once you're confident.

## ⚠️ Data-freshness note

The data was migrated on 2026-07-17. It's pre-launch (no active users), but if
anyone edits the OLD accounting/reservations sites before the DNS flip, the new
`production` branch will be stale. To re-sync right before flipping: TRUNCATE the
`production` tables (or reset the branch from parent) and re-run
`scripts/merge/migrate-unified.sh` with `TARGET_URL` = the `production` direct
URL. Then re-run the accounting cross-check (docs/merge/accounting-fingerprint.sql
diff + the per-table hash diff) to confirm byte-identity again.
