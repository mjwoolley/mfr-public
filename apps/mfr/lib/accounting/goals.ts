// Contribution-goal lookup + the progress math behind the dashboard's goal
// tracker. Goals are keyed by fiscal year (see @/lib/fiscalYear).

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { contributionGoal } from "@/lib/db/schema";

export interface GoalProgress {
  /** 0–100, clamped. */
  pct: number;
  /** Dollars still to raise, floored at 0. */
  remaining: number;
  note: string;
}

const usd0 = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

/** Pure progress math for the dashboard goal tracker. */
export function computeGoalProgress(goalAmount: number, raised: number): GoalProgress {
  if (goalAmount <= 0) {
    return { pct: 0, remaining: 0, note: "" };
  }
  const pct = Math.min(100, Math.round((raised / goalAmount) * 100));
  const remaining = Math.max(0, goalAmount - raised);
  const note =
    remaining === 0
      ? "Goal met — thank you, everyone!"
      : `${pct}% funded · ${usd0(remaining)} to go`;
  return { pct, remaining, note };
}

export async function getContributionGoal(year: number) {
  return (
    (await db.query.contributionGoal.findFirst({
      where: eq(contributionGoal.year, year),
    })) ?? null
  );
}
