/**
 * Pure geometry/math for the Expenses tab's "Income vs. expenses by year"
 * combo chart, ported from the Organic design handoff's prototype logic
 * (Accounting.dc.html, renderVals). Everything here is plain numbers in,
 * plain SVG coordinates out, so the chart itself can be a dumb renderer and
 * the math is unit-testable — the same fetch-then-compute split as
 * groupContributionsByYear in @/lib/ledger.
 */

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
  /** Years drawn as bars: only years with any expense activity. */
  chartYears: YearFinancials[];
  /** Contribution-only years excluded from the bars (the founding raise). */
  foundingYears: YearFinancials[];
  axisMax: number;
  /** Symmetric right-axis bound: the cumulative axis runs [-hiC, +hiC]. */
  cumulativeMax: number;
  gridTicks: GridTick[];
  bars: ChartBar[];
  yearLabels: { x: number; label: number }[];
  linePoints: string;
  dots: ChartDot[];
}

const usd0 = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const signed = (n: number) => (n === 0 ? "$0" : (n > 0 ? "+" : "") + usd0(n));

/** "$0" / "$5k" / "-$10k" axis labels. */
const kfmt = (v: number) => (v === 0 ? "$0" : `${v < 0 ? "-" : ""}$${Math.round(Math.abs(v) / 1000)}k`);

function expensesOf(y: YearFinancials): number {
  return y.operating + y.capital;
}

/** Bars only show years with expense activity; contribution-only years
 * (the founding raise) are called out in a caption instead so operating
 * years stay legible. */
export function splitChartYears(data: YearFinancials[]): {
  chartYears: YearFinancials[];
  foundingYears: YearFinancials[];
} {
  const sorted = [...data].sort((a, b) => a.year - b.year);
  const chartYears = sorted.filter((y) => expensesOf(y) > 0);
  const charted = new Set(chartYears.map((y) => y.year));
  const foundingYears = sorted.filter((y) => y.contributions > 0 && !charted.has(y.year));
  return { chartYears, foundingYears };
}

/** Left axis rounds up to the next $5k so the top gridline clears every bar. */
export function computeAxisMax(chartYears: YearFinancials[]): number {
  const ieMax = Math.max(1, ...chartYears.map((y) => Math.max(y.contributions, expensesOf(y))));
  return Math.max(5000, Math.ceil(ieMax / 5000) * 5000);
}

/**
 * Cumulative net change (contributions − operating − capital), accumulated
 * over ALL years but re-based to 0 just before the first charted year — the
 * founding balance is excluded, so the first charted year shows its own net
 * and each later year adds on.
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

  const first = chartYears[0];
  const base0 = first
    ? (cum.get(first.year) ?? 0) - (first.contributions - expensesOf(first))
    : 0;

  const rebased = new Map<number, number>();
  for (const y of chartYears) {
    rebased.set(y.year, (cum.get(y.year) ?? 0) - base0);
  }
  return rebased;
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
  const { chartYears, foundingYears } = splitChartYears(data);
  const axisMax = computeAxisMax(chartYears);

  const plotW = right - left;
  const slotW = plotW / (chartYears.length || 1);

  const bars: ChartBar[] = [];
  const yearLabels: { x: number; label: number }[] = [];
  chartYears.forEach((y, i) => {
    const cx = left + slotW * (i + 0.5);
    const inH = Math.max(0, Math.round((y.contributions / axisMax) * plotH));
    const opH = Math.max(0, Math.round((y.operating / axisMax) * plotH));
    const capH = Math.max(0, Math.round((y.capital / axisMax) * plotH));
    bars.push({
      x: Math.round(cx - 31),
      y: Math.round(base - inH),
      w: 28,
      h: inH,
      kind: "contributions",
      title: `${y.year} · Contributions in: ${usd0(y.contributions)}`,
    });
    bars.push({
      x: Math.round(cx + 3),
      y: Math.round(base - opH),
      w: 28,
      h: opH,
      kind: "operating",
      title: `${y.year} · Operating expenses: ${usd0(y.operating)}`,
    });
    bars.push({
      x: Math.round(cx + 3),
      y: Math.round(base - opH - capH),
      w: 28,
      h: capH,
      kind: "capital",
      title: `${y.year} · Capital investment: ${usd0(y.capital)}`,
    });
    yearLabels.push({ x: Math.round(cx), label: y.year });
  });

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
      title: `${y.year} · Cumulative change: ${signed(v)}`,
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
    foundingYears,
    axisMax,
    cumulativeMax,
    gridTicks,
    bars,
    yearLabels,
    linePoints,
    dots,
  };
}

/** Caption for the excluded founding year(s), e.g.
 * "2019: $69,500 raised (founding contribution for the down payment)". */
export function foundingNote(foundingYears: YearFinancials[]): string {
  return foundingYears
    .map((y) => `${y.year}: ${usd0(y.contributions)} raised (founding contribution for the down payment)`)
    .join(" · ");
}
