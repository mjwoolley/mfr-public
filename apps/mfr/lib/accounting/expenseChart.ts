/**
 * Pure geometry/math for the Expenses tab's "Income vs. expenses by year"
 * combo chart, ported from the Organic design handoff's prototype logic
 * (Accounting.dc.html, renderVals). Everything here is plain numbers in,
 * plain SVG coordinates out, so the chart itself can be a dumb renderer and
 * the math is unit-testable — the same fetch-then-compute split as
 * groupContributionsByYear in @/lib/ledger. Every `year` here is a fiscal
 * year (see @/lib/fiscalYear); labels render as `FY####`.
 */

import { fiscalYearLabel } from "@/lib/accounting/fiscalYear";

export interface YearFinancials {
  year: number;
  contributions: number;
  operating: number;
  capital: number;
}

export interface ChartGeometry {
  top: number;
  plotH: number;
  left: number;
  right: number;
}

/** The prototype's viewBox is 660×240 with these plot bounds. */
export const DEFAULT_GEOMETRY: ChartGeometry = { top: 20, plotH: 172, left: 54, right: 598 };

export interface ChartBar {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "contributions" | "operating" | "capital";
  title: string;
}

export interface ChartDot {
  cx: number;
  cy: number;
  value: number;
  title: string;
}

export interface GridTick {
  y: number;
  leftLabel: string;
  rightLabel: string;
}

export interface IncomeExpenseChart {
  /** Years drawn as bars: every year with any activity. */
  chartYears: YearFinancials[];
  axisMax: number;
  /** Symmetric right-axis bound: the cumulative axis runs [-hiC, +hiC]. */
  cumulativeMax: number;
  gridTicks: GridTick[];
  bars: ChartBar[];
  yearLabels: { x: number; label: number }[];
  linePoints: string;
  dots: ChartDot[];
  /** Visible line-dot radius — smaller when year slots are narrow. */
  dotR: number;
}

const usd0 = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const signed = (n: number) => (n === 0 ? "$0" : (n > 0 ? "+" : "") + usd0(n));

/** "$0" / "$5k" / "-$10k" axis labels. */
const kfmt = (v: number) =>
  v === 0 ? "$0" : `${v < 0 ? "-" : ""}$${Math.round(Math.abs(v) / 1000)}k`;

function expensesOf(y: YearFinancials): number {
  return y.operating + y.capital;
}

/** Every year with any activity gets a bar slot — contributions included,
 * since the family's history has contribution-only years going back decades
 * and hiding them made the chart look broken. Zero-activity years are
 * skipped. */
export function activeYears(data: YearFinancials[]): YearFinancials[] {
  return [...data]
    .filter((y) => y.contributions > 0 || expensesOf(y) > 0)
    .sort((a, b) => a.year - b.year);
}

/** Left axis rounds up to the next $5k so the top gridline clears every bar. */
export function computeAxisMax(chartYears: YearFinancials[]): number {
  const ieMax = Math.max(1, ...chartYears.map((y) => Math.max(y.contributions, expensesOf(y))));
  return Math.max(5000, Math.ceil(ieMax / 5000) * 5000);
}

/**
 * Cumulative net change (contributions − operating − capital), accumulated
 * over all years from the first active one.
 */
export function computeCumulativeValues(
  data: YearFinancials[],
  chartYears: YearFinancials[],
): Map<number, number> {
  const sorted = [...data].sort((a, b) => a.year - b.year);
  const cum = new Map<number, number>();
  let run = 0;
  for (const y of sorted) {
    run += y.contributions - expensesOf(y);
    cum.set(y.year, run);
  }

  const charted = new Map<number, number>();
  for (const y of chartYears) {
    charted.set(y.year, cum.get(y.year) ?? 0);
  }
  return charted;
}

/** Right axis is symmetric about $0 (so $0 sits on the center gridline),
 * rounded up to the next $10k. */
export function computeCumulativeMax(cumulativeValues: Map<number, number>): number {
  const maxAbs = Math.max(1, ...[...cumulativeValues.values()].map(Math.abs));
  return Math.max(10000, Math.ceil(maxAbs / 10000) * 10000);
}

export function computeIncomeExpenseChart(
  data: YearFinancials[],
  geometry: ChartGeometry = DEFAULT_GEOMETRY,
): IncomeExpenseChart {
  const { top, plotH, left, right } = geometry;
  const base = top + plotH;
  const chartYears = activeYears(data);
  const axisMax = computeAxisMax(chartYears);

  const plotW = right - left;
  const slotW = plotW / (chartYears.length || 1);

  // The income bar and the expense stack sit side by side within each
  // year's slot; widths shrink with the slot so decades of history fit.
  const pairGap = slotW >= 40 ? 6 : 2;
  const barW = Math.max(3, Math.min(28, Math.floor((slotW - pairGap) / 2) - 1));
  // Nonzero values always get a visible bar; zero values get no bar at all.
  const barH = (v: number) => (v <= 0 ? 0 : Math.max(2, Math.round((v / axisMax) * plotH)));
  // Thin the x-axis labels so ~44px of room stays between them, anchored to
  // the most recent year so the current year is always labeled.
  const labelStep = Math.max(1, Math.ceil(chartYears.length / Math.floor(plotW / 44)));
  const isLabeled = (i: number) => (chartYears.length - 1 - i) % labelStep === 0;

  const bars: ChartBar[] = [];
  const yearLabels: { x: number; label: number }[] = [];
  chartYears.forEach((y, i) => {
    const cx = left + slotW * (i + 0.5);
    const inH = barH(y.contributions);
    const opH = barH(y.operating);
    const capH = barH(y.capital);
    if (inH > 0)
      bars.push({
        x: Math.round(cx - pairGap / 2 - barW),
        y: Math.round(base - inH),
        w: barW,
        h: inH,
        kind: "contributions",
        title: `${fiscalYearLabel(y.year)} · Contributions in: ${usd0(y.contributions)}`,
      });
    if (opH > 0)
      bars.push({
        x: Math.round(cx + pairGap / 2),
        y: Math.round(base - opH),
        w: barW,
        h: opH,
        kind: "operating",
        title: `${fiscalYearLabel(y.year)} · Operating expenses: ${usd0(y.operating)}`,
      });
    if (capH > 0)
      bars.push({
        x: Math.round(cx + pairGap / 2),
        y: Math.round(base - opH - capH),
        w: barW,
        h: capH,
        kind: "capital",
        title: `${fiscalYearLabel(y.year)} · Capital investment: ${usd0(y.capital)}`,
      });
    if (isLabeled(i)) yearLabels.push({ x: Math.round(cx), label: y.year });
  });

  // The cumulative line gets its own right-hand axis, deliberately symmetric
  // ([-max, +max]) so $0 always lands on the middle gridline — the line can
  // dip negative without needing a different gridline layout than the bars.
  const cumulativeValues = computeCumulativeValues(data, chartYears);
  const cumulativeMax = computeCumulativeMax(cumulativeValues);
  const loC = -cumulativeMax;
  const hiC = cumulativeMax;
  const lineY = (v: number) => Math.round(top + plotH * (1 - (v - loC) / (hiC - loC)));

  const dots: ChartDot[] = chartYears.map((y, i) => {
    const v = cumulativeValues.get(y.year) ?? 0;
    return {
      cx: Math.round(left + slotW * (i + 0.5)),
      cy: lineY(v),
      value: v,
      title: `${fiscalYearLabel(y.year)} · Cumulative change: ${signed(v)}`,
    };
  });
  const linePoints = dots.map((d) => `${d.cx},${d.cy}`).join(" ");

  // Both axes share the same five horizontal gridlines.
  const gridTicks: GridTick[] = [0, 1, 2, 3, 4].map((i) => {
    const leftValue = (axisMax * i) / 4;
    const rightValue = loC + ((hiC - loC) * i) / 4;
    return {
      y: Math.round(base - (leftValue / axisMax) * plotH),
      leftLabel: kfmt(leftValue),
      rightLabel: kfmt(rightValue),
    };
  });

  return {
    chartYears,
    axisMax,
    cumulativeMax,
    gridTicks,
    bars,
    yearLabels,
    linePoints,
    dots,
    dotR: slotW < 24 ? 3 : 4.5,
  };
}
