#!/usr/bin/env node
/**
 * Promote mfr_web's latest READY production deployment to the domains.
 *
 * Workaround for a Vercel-side quirk: mfr_web's production deployments
 * build READY but stay readySubstate=STAGED (custom-domain assignment is
 * skipped), so millerfamilyreunions.org keeps serving the old build until
 * someone promotes. Auto-assign is ON in settings, the project is not a
 * microfrontend, there are no checks or rolling releases — the staging
 * appears to be stale platform state left over from the deleted 2026-07
 * microfrontends group, unfixable from any self-service surface (verified
 * 2026-07-11: rewrote the setting via API and dashboard, recreated+deleted
 * a microfrontends group; deployments still staged).
 *
 * Usage (after any push that touches apps/web):
 *   npm run promote:web
 *
 * Auth: uses your local Vercel CLI login (vercel login).
 */
import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const PROJECT_ID = "prj_TTIQErgtpfT93dLps4hhxzc2AFDb"; // mfr_web
const TEAM_ID = "team_mLVl2dmB4UugVGW3TnAzp3iQ";

const authPath = path.join(
  homedir(),
  "Library/Application Support/com.vercel.cli/auth.json",
);
const token = JSON.parse(readFileSync(authPath, "utf8")).token;
if (!token) {
  console.error("No Vercel CLI token found — run `vercel login` first.");
  process.exit(1);
}

const res = await fetch(
  `https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_ID}&target=production&state=READY&limit=1`,
  { headers: { Authorization: `Bearer ${token}` } },
);
const { deployments } = await res.json();
const latest = deployments?.[0];
if (!latest) {
  console.error("No READY production deployment found.");
  process.exit(1);
}

console.log(
  `Latest production deployment: ${latest.url}\n` +
    `  commit: ${latest.meta?.githubCommitMessage ?? "?"}\n` +
    `  substate: ${latest.readySubstate}`,
);
if (latest.readySubstate === "PROMOTED") {
  console.log("Already promoted — nothing to do.");
  process.exit(0);
}

const webDir = path.join(import.meta.dirname, "..", "apps", "web");
const result = spawnSync("npx", ["vercel", "promote", latest.uid, "--yes"], {
  cwd: webDir,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
