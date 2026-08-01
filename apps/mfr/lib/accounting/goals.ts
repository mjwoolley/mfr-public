// Share-purchase-goal lookup + the progress math behind the dashboard's goal
// tracker. Goals are keyed by fiscal year (see @/lib/fiscalYear).
//
// The goal is expressed in shares. The stored column is still
// `ContributionGoal.amount` and its values are unchanged — $1 buys 1 share, so
// the number is the same either way; only what it is called changes.

import { eq } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { contributionGoal } from '@/lib/db/schema'
import { formatShares } from './format'

export interface GoalProgress {
  /** 0–100, clamped. */
  pct: number
  /** Shares still to sell, floored at 0. */
  remaining: number
  note: string
}

/** Pure progress math for the dashboard goal tracker. */
export function computeGoalProgress(goalAmount: number, raised: number): GoalProgress {
  if (goalAmount <= 0) {
    return { pct: 0, remaining: 0, note: '' }
  }
  const pct = Math.min(100, Math.round((raised / goalAmount) * 100))
  const remaining = Math.max(0, goalAmount - raised)
  const note =
    remaining === 0
      ? 'Goal met — thank you, everyone!'
      : `${pct}% funded · ${formatShares(remaining)} shares to go`
  return { pct, remaining, note }
}

export async function getContributionGoal(year: number) {
  return (
    (await db.query.contributionGoal.findFirst({
      where: eq(contributionGoal.year, year),
    })) ?? null
  )
}
