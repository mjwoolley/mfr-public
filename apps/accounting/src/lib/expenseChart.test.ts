import { describe, expect, it } from "vitest";
import {
  activeYears,
  computeAxisMax,
  computeCumulativeMax,
  computeCumulativeValues,
  computeIncomeExpenseChart,
  DEFAULT_GEOMETRY,
  type YearFinancials,
} from "./expenseChart";

// Hand-computed fixture: a contribution-only year, then three operating
// years. Cumulative net from the first active year:
//   2019: +50000
//   2024: +50000 + (10000 − 4000 − 1000) = +55000
//   2025: +55000 + (2000 − 3000 − 5000)  = +49000
//   2026: +49000 + (8000 − 2000 − 0)     = +55000
const data: YearFinancials[] = [
  { year: 2019, contributions: 50000, operating: 0, capital: 0 },
  { year: 2024, contributions: 10000, operating: 4000, capital: 1000 },
  { year: 2025, contributions: 2000, operating: 3000, capital: 5000 },
  { year: 2026, contributions: 8000, operating: 2000, capital: 0 },
];

/** A long real-world-shaped history: contributions every year, expenses
 * only in the last one — like the family's actual data. */
const longHistory: YearFinancials[] = Array.from({ length: 34 }, (_, i) => ({
  year: 1993 + i,
  contributions: 5000 + (i % 7) * 1000,
  operating: i === 33 ? 2104 : 0,
  capital: 0,
}));

describe("activeYears", () => {
  it("charts every year with any activity, contributions included", () => {
    expect(activeYears(data).map((y) => y.year)).toEqual([2019, 2024, 2025, 2026]);
  });

  it("skips zero-activity years", () => {
    const withEmpty = [...data, { year: 2020, contributions: 0, operating: 0, capital: 0 }];
    expect(activeYears(withEmpty).map((y) => y.year)).toEqual([2019, 2024, 2025, 2026]);
  });
});

describe("computeCumulativeValues", () => {
  it("accumulates net change from the first active year", () => {
    const years = activeYears(data);
    const cum = computeCumulativeValues(data, years);
    expect(cum.get(2019)).toBe(50000);
    expect(cum.get(2024)).toBe(55000);
    expect(cum.get(2025)).toBe(49000);
    expect(cum.get(2026)).toBe(55000);
  });
});

describe("axis scaling", () => {
  it("rounds the left axis up to the next $5k with a $5k floor", () => {
    expect(computeAxisMax(activeYears(data))).toBe(50000);
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
    // Symmetric labels around the center (max |cumulative| 55000 → 60000).
    expect(chart.gridTicks[0].rightLabel).toBe("-$60k");
    expect(chart.gridTicks[4].rightLabel).toBe("$60k");
    // Same gridline y positions serve the left axis ($0 at the base).
    expect(chart.gridTicks[0].leftLabel).toBe("$0");
    expect(chart.gridTicks[4].leftLabel).toBe("$50k");
  });

  it("draws a contribution bar for a contribution-only year", () => {
    const bar2019 = chart.bars.find((b) => b.title.startsWith("FY2019"));
    expect(bar2019).toBeDefined();
    expect(bar2019!.kind).toBe("contributions");
    expect(bar2019!.h).toBeGreaterThan(0);
  });

  it("stacks the capital bar directly on top of the operating bar", () => {
    const bars2025 = chart.bars.filter((b) => b.title.startsWith("FY2025"));
    const operating = bars2025.find((b) => b.kind === "operating")!;
    const capital = bars2025.find((b) => b.kind === "capital")!;
    expect(capital.x).toBe(operating.x);
    expect(capital.y + capital.h).toBe(operating.y);
  });

  it("omits zero-value bars instead of drawing empty rects", () => {
    // 2019 has no expenses and 2026 has no capital — no bars for those.
    expect(chart.bars.filter((b) => b.h === 0)).toEqual([]);
    expect(
      chart.bars.some((b) => b.title.startsWith("FY2026") && b.kind === "capital"),
    ).toBe(false);
  });

  it("gives every bar and dot an exact-figure tooltip title", () => {
    expect(chart.bars.map((b) => b.title)).toContain("FY2025 · Capital investment: $5,000");
    expect(chart.dots.map((d) => d.title)).toContain("FY2025 · Cumulative change: +$49,000");
    expect(chart.dots.map((d) => d.title)).toContain("FY2026 · Cumulative change: +$55,000");
  });

  it("aligns each dot with its year's slot center", () => {
    const contributions = chart.bars.filter((b) => b.kind === "contributions");
    chart.dots.forEach((dot, i) => {
      // The contributions bar sits just left of the slot center.
      expect(contributions[i].x + contributions[i].w).toBeLessThanOrEqual(dot.cx);
      expect(contributions[i].x).toBeGreaterThan(dot.cx - dot.cx / 2);
    });
  });

  it("still charts contribution bars when no expenses exist at all", () => {
    const noExpenses = computeIncomeExpenseChart([
      { year: 2019, contributions: 50000, operating: 0, capital: 0 },
    ]);
    expect(noExpenses.chartYears.map((y) => y.year)).toEqual([2019]);
    expect(noExpenses.bars).toHaveLength(1);
    expect(noExpenses.bars[0].kind).toBe("contributions");
    expect(noExpenses.linePoints).not.toBe("");
  });
});

describe("computeIncomeExpenseChart with a long history", () => {
  const chart = computeIncomeExpenseChart(longHistory);
  const { left, right } = DEFAULT_GEOMETRY;
  const slotW = (right - left) / longHistory.length;

  it("keeps each year's bars inside its own slot", () => {
    for (const bar of chart.bars) {
      const i = chart.chartYears.findIndex((y) => bar.title.startsWith(`FY${y.year}`));
      expect(bar.x).toBeGreaterThanOrEqual(Math.floor(left + slotW * i));
      expect(bar.x + bar.w).toBeLessThanOrEqual(Math.ceil(left + slotW * (i + 1)));
    }
  });

  it("keeps tiny nonzero values visible", () => {
    // $2,104 against a big axis still gets a visible bar.
    const expenseBar = chart.bars.find((b) => b.kind === "operating")!;
    expect(expenseBar.h).toBeGreaterThanOrEqual(2);
  });

  it("thins year labels so they cannot collide, keeping the latest year", () => {
    expect(chart.yearLabels.length).toBeLessThanOrEqual(13);
    expect(chart.yearLabels.at(-1)!.label).toBe(2026);
    // Labeled positions are evenly stepped.
    const xs = chart.yearLabels.map((l) => l.x);
    expect(new Set(xs).size).toBe(xs.length);
  });

  it("shrinks the line dots when slots are narrow", () => {
    expect(chart.dotR).toBeLessThan(4.5);
  });

  it("keeps full-size dots when slots are wide", () => {
    expect(computeIncomeExpenseChart(data).dotR).toBe(4.5);
  });
});
