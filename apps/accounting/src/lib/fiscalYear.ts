/**
 * The family's fiscal year runs March 1 → end of February, so FY2025 spans
 * March 2025 through February 2026. Every year-based figure in the app
 * (contributions, expenses, the income/expense chart, the contribution goal,
 * the dashboard) buckets by fiscal year, derived from a row's date — there is
 * no stored fiscal-year column, so a date correction can never disagree with
 * it. This module is the single source of truth for that derivation.
 *
 * Pure and timezone-deterministic: uses getUTCMonth/getUTCFullYear for the
 * same reason the grouping helpers in @/lib/ledger and @/lib/expenses do —
 * dev boxes, CI, and Vercel's UTC runtime must never disagree on which
 * fiscal year a near-midnight timestamp falls in.
 */

/** First month of the fiscal year, 1-indexed (March). */
export const FISCAL_START_MONTH = 3;

/** The fiscal year a date falls in, named by its starting calendar year
 * (FY2025 = Mar 2025 – Feb 2026). Jan/Feb roll into the previous year's FY. */
export function fiscalYear(date: Date): number {
  const month = date.getUTCMonth(); // 0-indexed: Jan = 0 … Dec = 11
  const year = date.getUTCFullYear();
  return month >= FISCAL_START_MONTH - 1 ? year : year - 1;
}

/** UI label for a fiscal year, e.g. `FY2025`. */
export function fiscalYearLabel(fy: number): string {
  return `FY${fy}`;
}

/** Half-open date range [start, end) covering a fiscal year — for date-range
 * DB queries (e.g. contributions raised within the current fiscal year). */
export function fiscalYearRange(fy: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(fy, FISCAL_START_MONTH - 1, 1)),
    end: new Date(Date.UTC(fy + 1, FISCAL_START_MONTH - 1, 1)),
  };
}

/** The fiscal year containing `now` (defaults to the present). */
export function currentFiscalYear(now: Date = new Date()): number {
  return fiscalYear(now);
}
