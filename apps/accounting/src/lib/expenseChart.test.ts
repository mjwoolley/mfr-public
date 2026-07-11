import { describe, expect, it } from "vitest";
import {
  computeAxisMax,
  computeCumulativeMax,
  computeCumulativeValues,
  computeIncomeExpenseChart,
  foundingNote,
  splitChartYears,
  type YearFinancials,
} from "./expenseChart";

// Hand-computed fixture: a founding raise with no expenses, then three
// operating years. Cumulative net (re-based to 0 before 2024, i.e.
// excluding the 2019 founding balance):
//   2024: +10000 − 4000 − 1000 = +5000
//   2025: +5000 + (2000 − 3000 − 5000) = −1000
//   2026: −1000 + (8000 − 2000 − 0)   = +5000
const data: YearFinancials[] = [
  { year: 2019, contributions: 50000, operating: 0, capital: 0 },
  { year: 2024, contributions: 10000, operating: 4000, capital: 1000 },
  { year: 2025, contributions: 2000, operating: 3000, capital: 5000 },
  { year: 2026, contributions: 8000, operating: 2000, capital: 0 },
];

describe("splitChartYears", () => {
  it("charts only years with expense activity and flags contribution-only years as founding", () => {
    const { chartYears, foundingYears } = splitChartYears(data);
    expect(chartYears.map((y) => y.year)).toEqual([2024, 2025, 2026]);
    expect(foundingYears.map((y) => y.year)).toEqual([2019]);
  });

  it("does not list a zero-activity year as founding", () => {
    const withEmpty = [...data, { year: 2020, contributions: 0, operating: 0, capital: 0 }];
    const { foundingYears } = splitChartYears(withEmpty);
    expect(foundingYears.map((y) => y.year)).toEqual([2019]);
  });
});

describe("computeCumulativeValues", () => {
  it("starts from 0 before the first charted year, excluding the founding balance", () => {
    const { chartYears } = splitChartYears(data);
    const cum = computeCumulativeValues(data, chartYears);
    expect(cum.get(2024)).toBe(5000);
    expect(cum.get(2025)).toBe(-1000);
    expect(cum.get(2026)).toBe(5000);
    // The founding year itself is not on the line.
    expect(cum.has(2019)).toBe(false);
  });
});

describe("axis scaling", () => {
  it("rounds the left axis up to the next $5k with a $5k floor", () => {
    const { chartYears } = splitChartYears(data);
    expect(computeAxisMax(chartYears)).toBe(10000);
    expect(computeAxisMax([{ year: 2024, contributions: 10001, operating: 0, capital: 1 }])).toBe(
      15000,
    );
    expect(computeAxisMax([])).toBe(5000);
  });

  it("rounds the right axis up to the next $10k with a $10k floor, symmetric about 0", () => {
    expect(computeCumulativeMax(new Map([[2024, 5000]]))).toBe(10000);
    expect(computeCumulativeMax(new Map([[2024, -12000]]))).toBe(20000);
    expect(computeCumulativeMax(new Map())).toBe(10000);
  });
});

describe("computeIncomeExpenseChart", () => {
  const chart = computeIncomeExpenseChart(data);

  it("puts $0 of the right axis on the center gridline", () => {
    expect(chart.gridTicks).toHaveLength(5);
    expect(chart.gridTicks[2].rightLabel).toBe("$0");
    // Symmetric labels around the center.
    expect(chart.gridTicks[0].rightLabel).toBe("-$10k");
    expect(chart.gridTicks[4].rightLabel).toBe("$10k");
    // Same gridline y positions serve the left axis ($0 at the base).
    expect(chart.gridTicks[0].leftLabel).toBe("$0");
    expect(chart.gridTicks[4].leftLabel).toBe("$10k");
  });

  it("stacks the capital bar directly on top of the operating bar", () => {
    const bars2025 = chart.bars.filter((b) => b.title.startsWith("2025"));
    const operating = bars2025.find((b) => b.kind === "operating")!;
    const capital = bars2025.find((b) => b.kind === "capital")!;
    expect(capital.x).toBe(operating.x);
    expect(capital.y + capital.h).toBe(operating.y);
  });

  it("gives every bar and dot an exact-figure tooltip title", () => {
    expect(chart.bars.map((b) => b.title)).toContain("2025 · Capital investment: $5,000");
    expect(chart.dots.map((d) => d.title)).toContain("2025 · Cumulative change: -$1,000");
    expect(chart.dots.map((d) => d.title)).toContain("2026 · Cumulative change: +$5,000");
  });

  it("aligns each dot with its year's bar slot", () => {
    const contributions = chart.bars.filter((b) => b.kind === "contributions");
    chart.dots.forEach((dot, i) => {
      // The contributions bar starts 31px left of the slot center.
      expect(contributions[i].x).toBe(dot.cx - 31);
    });
  });

  it("handles a dataset with no expenses at all", () => {
    const empty = computeIncomeExpenseChart([
      { year: 2019, contributions: 50000, operating: 0, capital: 0 },
    ]);
    expect(empty.chartYears).toEqual([]);
    expect(empty.bars).toEqual([]);
    expect(empty.linePoints).toBe("");
    expect(empty.foundingYears.map((y) => y.year)).toEqual([2019]);
  });
});

describe("foundingNote", () => {
  it("describes each excluded founding year", () => {
    const { foundingYears } = splitChartYears(data);
    expect(foundingNote(foundingYears)).toBe(
      "2019: $50,000 raised (founding contribution for the down payment)",
    );
  });

  it("is empty when every year is charted", () => {
    expect(foundingNote([])).toBe("");
  });
});
