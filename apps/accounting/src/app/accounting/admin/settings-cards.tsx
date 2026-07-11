"use client";

import { useActionState, useTransition } from "react";
import { setContributionsVisibility } from "@/actions/settings";
import { setContributionGoal, type ActionState } from "@/actions/goals";

interface AdminSettingsCardsProps {
  contributionsVisibleToAll: boolean;
  currentYear: number;
  /** Current goal amount for currentYear, if one is set. */
  goalAmount: number | null;
}

/**
 * The two always-visible admin controls: Contributions-tab visibility
 * (Everyone vs Admins only) and the annual contribution goal.
 */
export function AdminSettingsCards({
  contributionsVisibleToAll,
  currentYear,
  goalAmount,
}: AdminSettingsCardsProps) {
  const [visibilityPending, startVisibility] = useTransition();
  const [goalState, goalAction, goalPending] = useActionState<ActionState, FormData>(
    setContributionGoal,
    undefined,
  );

  function setVisibility(visibleToAll: boolean) {
    if (visibleToAll === contributionsVisibleToAll) return;
    startVisibility(async () => {
      await setContributionsVisibility(visibleToAll);
    });
  }

  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="card elev-sm flex-wrap bg-white px-5 py-4" style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <div className="min-w-[200px] flex-1">
          <div className="text-base" style={{ fontFamily: "var(--font-heading)" }}>
            Contributions tab visibility
          </div>
          <div className="text-muted mt-0.5 text-[13px]">
            {contributionsVisibleToAll
              ? "All shareholders can open the Contributions tab."
              : "Only admins can open the Contributions tab. Shareholders still see their dashboard, ownership and expenses."}
          </div>
        </div>
        <div className="seg" style={{ background: "var(--color-surface)", opacity: visibilityPending ? 0.6 : 1 }}>
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
        style={{ flexDirection: "row", alignItems: "flex-end", gap: 16 }}
      >
        <div className="min-w-[200px] flex-1">
          <div className="text-base" style={{ fontFamily: "var(--font-heading)" }}>
            Annual contribution goal
          </div>
          <div className="text-muted mt-0.5 text-[13px]">
            Shown as the dashboard progress tracker.
          </div>
        </div>
        <div className="field w-24">
          <label htmlFor="goal-year">Year</label>
          <input
            id="goal-year"
            name="year"
            className="input"
            type="number"
            defaultValue={currentYear}
            min={2000}
            max={2100}
            required
          />
        </div>
        <div className="field w-36">
          <label htmlFor="goal-amount">Goal amount ($)</label>
          <input
            id="goal-amount"
            name="amount"
            className="input"
            type="number"
            min="1"
            step="1"
            defaultValue={goalAmount ?? ""}
            required
          />
        </div>
        <div className="flex items-center gap-3 pb-0.5">
          <button type="submit" className="btn btn-primary" disabled={goalPending}>
            {goalPending ? "Saving…" : "Save goal"}
          </button>
          {goalState?.saved && (
            <span className="text-[13px] font-semibold" style={{ color: "var(--color-accent-2-700)" }}>
              Saved.
            </span>
          )}
        </div>
        {goalState?.error && (
          <p className="m-0 w-full text-[13px] font-semibold" style={{ color: "var(--color-accent-800)" }}>
            {goalState.error}
          </p>
        )}
      </form>
    </div>
  );
}
