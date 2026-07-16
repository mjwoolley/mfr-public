import { NextResponse } from "next/server";
import { getRaisedThisYear } from "@/lib/ledger";
import { getContributionGoal } from "@/lib/goals";

// Public, totals-only endpoint for the portal's home fundraising card (shown to
// everyone, including signed-out visitors) — no PII, just the current-year
// contribution total vs. the configured goal. The portal reads this live rather
// than duplicating the number.
export async function GET() {
  const { year, raised } = await getRaisedThisYear();
  const goalRow = await getContributionGoal(year);
  const goal = goalRow ? Number(goalRow.amount) : null;

  return NextResponse.json(
    { year, raised, goal },
    { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
