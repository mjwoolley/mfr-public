import { describe, expect, it } from "vitest";
import { formatUSD, formatDate } from "./format";

describe("formatUSD", () => {
  it("formats a number as US currency", () => {
    expect(formatUSD(1234.5)).toBe("$1,234.50");
  });

  it("formats a numeric string", () => {
    expect(formatUSD("250")).toBe("$250.00");
  });

  it("formats zero and negative amounts", () => {
    expect(formatUSD(0)).toBe("$0.00");
    expect(formatUSD(-75.25)).toBe("-$75.25");
  });
});

describe("formatDate", () => {
  it("formats a date in medium style", () => {
    // Use a midday UTC time so the local-timezone rendering stays on the same date
    // in any US timezone.
    expect(formatDate(new Date("2026-07-04T12:00:00-05:00"))).toBe("Jul 4, 2026");
  });
});
