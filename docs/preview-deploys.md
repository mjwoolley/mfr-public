# Per-PR preview deployments (Phase 2) — runbook

Goal: give every PR its own isolated Vercel preview URL + its own Neon database
(forked from prod), so PRs stop queuing through the single shared `staging`
slot, and the merge gate reduces to "smoke the PR's own preview."

Status: **LIVE — verified 2026-07-20.** Per-PR previews build, fork their own
Neon branch from `production` (real data), and Google sign-in completes through
the prod redirect proxy. This doc is now the record of how it's wired (the steps
below are what it took); keep it current if the setup changes.

Context established (2026-07-19):

- Vercel project: **`mfr_web`** (team `michael-woolley-s-projects`).
- App uses **one** unified Neon project: **`mfr`** (`lucky-butterfly-29223414`),
  addressed by `DATABASE_URL` (pooled) + `DIRECT_URL` (unpooled, migrations).
- Today most runtime env (`AUTH_*`, `DATABASE_URL`, `DIRECT_URL`, `EMAIL_*`,
  `SES_*`) is scoped to **Preview (staging)** only; general previews have **no
  DB**. Previews are disabled via the Vercel Ignored Build Step.

---

## The footgun (read first)

**A preview must never share a `DATABASE_URL` that points at production** — a
preview could then write to prod. Each preview must get its **own** Neon branch.
Never set an all-Preview `DATABASE_URL` to a shared/prod database. Use the
integration's per-preview branch (below).

---

## Step 1 — Neon↔Vercel integration (owner, interactive, BLOCKING)

`vercel integration add` needs a browser/device attestation, so this is a
dashboard step. In the Vercel dashboard → `mfr_web` → Integrations (or Vercel
Marketplace → Neon):

1. Install the **Neon** native integration and connect it to the existing `mfr`
   Neon project (do **not** create a new one).
2. Enable **"Create a database branch for each preview deployment."**
3. Set the **parent branch = `production`** so each preview forks from real prod
   data (the data-source choice: straight-from-prod, accepted).
4. Confirm which env vars it injects into the **Preview** environment. The native
   integration typically injects `DATABASE_URL` (pooled) and
   `DATABASE_URL_UNPOOLED`. Our app also needs **`DIRECT_URL`** (unpooled) for
   migrations — see Step 4.

Neon auto-deletes the per-preview branch when the preview is removed.

## Step 2 — Preview auth env (owner decision: shares prod secrets)

For the OAuth redirect proxy to work on `*.vercel.app`, previews must reuse two
production secrets. This is a deliberate security tradeoff (a preview
vulnerability could leak them); acceptable for a private, auth-gated app, but
**confirm before setting**:

- **`AUTH_SECRET` (Preview) = the Production value.** Mandatory: the proxy (prod)
  decrypts the OAuth `state` the preview created, using a shared `AUTH_SECRET`
  (`@auth/core` callback/index.js). A different secret → prod can't decode the
  state → sign-in fails. (This differs from staging, which intentionally uses a
  distinct secret.)
- **`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` (Preview) = the Production values.**
  The `redirect_uri` sent to Google is prod's callback
  (`https://millerfamilyreunions.org/api/auth/callback/google`), so the client
  presenting it must be prod's client. Google needs **no new redirect URIs**.
  (Watch the dashboard: it's easy to paste the var _name_ into the value field —
  a value of literally `AUTH_GOOGLE_ID` yields Google `invalid_client`.)

### ⚠️ CRITICAL: also configure the PROXY side (Production) — then REDEPLOY prod

The redirect proxy only works if **prod knows it is the proxy**. Set on
**Production** too:

- **`AUTH_REDIRECT_PROXY_URL = https://millerfamilyreunions.org/api/auth` on
  Production.** Without it, prod's `isOnRedirectProxy` is false, so when Google's
  callback hits prod, prod tries to _complete_ the login itself instead of
  forwarding to the preview — and fails (`InvalidCheck: pkceCodeVerifier value
could not be parsed`, since the PKCE cookie lives on the preview host). Safe
  for prod's own sign-in: a same-origin login isn't forwarded.
- **Prod and Preview must share the same `AUTH_SECRET`** (prod decrypts the
  preview's OAuth `state`). Rotating to one shared value is fine — DB sessions
  persist (they aren't `AUTH_SECRET`-signed), only in-flight OAuth is affected.
- **Env changes need a deploy to take effect.** After setting the prod var /
  rotating the secret, **redeploy production** (`vercel redeploy <prod-dpl-id>` —
  reuses the same commit with current env, auto-promotes). The _running_ prod
  deployment keeps its old env until then, which will look like a mismatch.

Then set these Preview (all-branches) vars — reversible, non-secret:

- `AUTH_REDIRECT_PROXY_URL = https://millerfamilyreunions.org/api/auth`
- `AUTH_TRUST_HOST = true` (so Auth.js derives each preview's own origin/callback)
- `ADDITIONAL_ALLOWED_ORIGINS = *.vercel.app` (Server Actions allowlist — code
  already honors this, see `apps/mfr/lib/allowedOrigins.ts`)

Do **NOT** set for Preview:

- `AUTH_URL` — must derive from the preview host, not a fixed origin.
- `AUTH_COOKIE_DOMAIN` — keep the session cookie host-only (works on any host).
- `EMAIL_ENABLED` — leave unset so previews never send real mail.

Vars already correctly all-Preview (no action): `R2_*`, `BLOB_READ_WRITE_TOKEN`,
`GOOGLE_DRVE_SA_KEY`, `SMOKE_SESSION_TOKEN`, `CRON_SECRET`.

Example (run once the integration is connected and secret-sharing is approved):

```sh
cd apps/mfr
printf 'https://millerfamilyreunions.org/api/auth' | vercel env add AUTH_REDIRECT_PROXY_URL preview
printf 'true'                                       | vercel env add AUTH_TRUST_HOST preview
printf '*.vercel.app'                               | vercel env add ADDITIONAL_ALLOWED_ORIGINS preview
# AUTH_SECRET / AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET: copy the Production values into Preview scope
```

### ⚠️ Don't let the proxy leak into `staging`

A general **Preview** env var applies to **every** preview deployment —
**including the `staging` branch** (staging deploys are Preview-environment
deploys). So a blanket `AUTH_REDIRECT_PROXY_URL` would make `staging` route its
OAuth through prod's callback while it still presents its **own** Google client →
staging sign-in breaks.

Guard against it by overriding the proxy var **on the staging branch** to point
at staging's own origin, which makes Auth.js treat staging as the proxy itself
(`isOnRedirectProxy` true → proxy not used):

```sh
# staging keeps behaving exactly as today
printf 'https://staging.millerfamilyreunions.org/api/auth' \
  | vercel env add AUTH_REDIRECT_PROXY_URL preview staging
```

`AUTH_SECRET` / `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` are already
staging-branch-scoped, so the general (prod) values don't override staging's —
no action needed for those. After setting env, **re-verify staging sign-in still
works** before relaxing the build gate.

## Step 3 — Relax the Vercel Ignored Build Step (owner or CLI)

Today (`docs/workflow.md`): builds only production + the `staging` branch, skips
all other previews:

```
if [ "$VERCEL_ENV" == "production" ] || [ "$VERCEL_GIT_COMMIT_REF" == "staging" ]; then exit 1; else exit 0; fi
```

To enable per-PR previews, **clear** the Ignored Build Step (build every branch),
or narrow it to only skip nothing relevant. Do this **last**, after Steps 1–2, so
previews don't deploy without a DB in the meantime. (A preview without a DB fails
closed — `client.ts` throws "DATABASE_URL is not set" — so it's safe, just noisy.)

## Step 4 — `DIRECT_URL` mapping for migrations (likely small code follow-up)

`vercel-build → scripts/migrate-deploy.mjs` and `drizzle.config.ts` require
`DIRECT_URL`. If the Neon integration injects the unpooled URL under a different
name (e.g. `DATABASE_URL_UNPOOLED`), add a fallback so previews migrate:

- `migrate-deploy.mjs` / `drizzle.config.ts`: read
  `process.env.DIRECT_URL ?? process.env.DATABASE_URL_UNPOOLED`.
  Confirm the actual injected name from Step 1 before implementing (TDD a tiny
  resolver, mirroring `lib/allowedOrigins.ts`).

## Step 5 — Simplify the gate to the PR's own preview (follow-up PR)

With per-PR previews, `post-deploy-smoke.yml` can smoke the PR's **own** preview
URL from the `deployment_status` event (the URL is on the event), making
attribution trivial — the Phase-1 `git merge-base --is-ancestor` step can be
removed. Keep `staging` + its DB as the final integration gate before merge
(decided). Update `docs/workflow.md` accordingly.

---

## Verification (per step, on a real preview)

1. Open a throwaway PR → confirm a preview deploys and a Neon branch was forked
   from prod (Neon console shows `preview/<...>`).
2. Sign in on the preview → the handshake goes prod-proxy → back to the preview
   origin, session lands (confirms shared `AUTH_SECRET` + prod Google client +
   `AUTH_TRUST_HOST`).
3. Exercise a Server Action (a form/mutation) → passes (confirms
   `ADDITIONAL_ALLOWED_ORIGINS`).
4. `node scripts/smoke.mjs <preview-url>` green.
5. Close the PR → Neon branch auto-removed.
