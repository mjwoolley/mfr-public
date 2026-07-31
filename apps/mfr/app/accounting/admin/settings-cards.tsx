'use client'

import { useActionState, useTransition } from 'react'
import { setContributionsVisibility } from '@/actions/accounting/settings'
import { setContributionGoal, type ActionState } from '@/actions/accounting/goals'

interface AdminSettingsCardsProps {
  contributionsVisibleToAll: boolean
  /** Current fiscal year (see @/lib/fiscalYear) — the goal is keyed by it. */
  currentFiscalYear: number
  /** Current goal amount for the current fiscal year, if one is set. */
  goalAmount: number | null
}

/**
 * The two always-visible admin controls: Contributions-tab visibility
 * (Everyone vs Admins only) and the fiscal-year share purchase goal.
 */
export function AdminSettingsCards({
  contributionsVisibleToAll,
  currentFiscalYear,
  goalAmount,
}: AdminSettingsCardsProps) {
  const [visibilityPending, startVisibility] = useTransition()
  const [goalState, goalAction, goalPending] = useActionState<ActionState, FormData>(
    setContributionGoal,
    undefined,
  )

  function setVisibility(visibleToAll: boolean) {
    if (visibleToAll === contributionsVisibleToAll) return
    startVisibility(async () => {
      await setContributionsVisibility(visibleToAll)
    })
  }

  return (
    <div className="mb-6 flex flex-col gap-3">
      <div
        className="card elev-sm flex-wrap bg-white px-5 py-4"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}
      >
        <div className="min-w-[200px] flex-1">
          <div className="text-base" style={{ fontFamily: 'var(--font-heading)' }}>
            Share purchases tab visibility
          </div>
          <div className="text-muted mt-0.5 text-[13px]">
            {contributionsVisibleToAll
              ? 'All shareholders can open the Share purchases tab.'
              : 'Only admins can open the Share purchases tab. Shareholders still see their dashboard, ownership and expenses.'}
          </div>
        </div>
        <div
          className="seg"
          style={{ background: 'var(--color-surface)', opacity: visibilityPending ? 0.6 : 1 }}
        >
          <label className="seg-opt">
            <input
              type="radio"
              name="contrib-visibility"
              checked={contributionsVisibleToAll}
              onChange={() => setVisibility(true)}
              disabled={visibilityPending}
            />
            Everyone
          </label>
          <label className="seg-opt">
            <input
              type="radio"
              name="contrib-visibility"
              checked={!contributionsVisibleToAll}
              onChange={() => setVisibility(false)}
              disabled={visibilityPending}
            />
            Admins only
          </label>
        </div>
      </div>

      <form
        action={goalAction}
        className="card elev-sm flex-wrap bg-white px-5 py-4"
        style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}
      >
        <div className="min-w-[200px] flex-1">
          <div className="text-base" style={{ fontFamily: 'var(--font-heading)' }}>
            Fiscal-year share purchase goal
          </div>
          <div className="text-muted mt-0.5 text-[13px]">
            Shown as the dashboard progress tracker. Fiscal year runs Mar–Feb (FY
            {currentFiscalYear} = Mar {currentFiscalYear}–Feb {currentFiscalYear + 1}).
          </div>
        </div>
        <div className="field w-28">
          <label htmlFor="goal-year">Fiscal year</label>
          <input
            id="goal-year"
            name="year"
            className="input"
            type="number"
            defaultValue={currentFiscalYear}
            min={2000}
            max={2100}
            required
          />
        </div>
        <div className="field w-36">
          <label htmlFor="goal-amount">Goal (shares)</label>
          <input
            id="goal-amount"
            name="amount"
            className="input"
            type="number"
            min="1"
            step="1"
            defaultValue={goalAmount ?? ''}
            required
          />
        </div>
        <div className="flex items-center gap-3 pb-0.5">
          <button type="submit" className="btn btn-primary" disabled={goalPending}>
            {goalPending ? 'Saving…' : 'Save goal'}
          </button>
          {goalState?.saved && (
            <span
              className="text-[13px] font-semibold"
              style={{ color: 'var(--color-accent-2-700)' }}
            >
              Saved.
            </span>
          )}
        </div>
        {goalState?.error && (
          <p
            className="m-0 w-full text-[13px] font-semibold"
            style={{ color: 'var(--color-accent-800)' }}
          >
            {goalState.error}
          </p>
        )}
      </form>
    </div>
  )
}
