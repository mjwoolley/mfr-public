import { describe, expect, it } from "vitest";
import {
  transactionTypeTag,
  expenseCategoryTag,
  approvalStatusTag,
  EXPENSE_CATEGORY_LABELS,
} from "./tags";
import type { ExpenseCategory } from "@/lib/accounting/enums";

describe("transactionTypeTag", () => {
  it("maps every transaction type to a label + Organic tag class", () => {
    expect(transactionTypeTag("CONTRIBUTION")).toEqual({
      label: "Contribution",
      className: "tag tag-accent-2",
    });
    expect(transactionTypeTag("TRANSFER")).toEqual({
      label: "Transfer",
      className: "tag tag-neutral",
    });
    expect(transactionTypeTag("ADJUSTMENT")).toEqual({
      label: "Adjustment",
      className: "tag tag-outline",
    });
    expect(transactionTypeTag("CORRECTION")).toEqual({
      label: "Correction",
      className: "tag tag-accent",
    });
  });
});

describe("expenseCategoryTag", () => {
  it("returns the human label and a tag class for every category", () => {
    for (const category of Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]) {
      const tag = expenseCategoryTag(category);
      expect(tag.label).toBe(EXPENSE_CATEGORY_LABELS[category]);
      expect(tag.className).toMatch(/^tag tag-/);
    }
  });

  it("spot-checks a couple of concrete mappings", () => {
    expect(expenseCategoryTag("TAXES")).toEqual({ label: "Taxes", className: "tag tag-neutral" });
    expect(expenseCategoryTag("IMPROVEMENTS")).toEqual({
      label: "Improvements",
      className: "tag tag-accent-2",
    });
  });
});

describe("approvalStatusTag", () => {
  it("maps every approval status", () => {
    expect(approvalStatusTag("CONFIRMED")).toEqual({
      label: "Confirmed",
      className: "tag tag-accent-2",
    });
    expect(approvalStatusTag("DISPUTED")).toEqual({
      label: "Disputed",
      className: "tag tag-accent",
    });
    expect(approvalStatusTag("PENDING")).toEqual({
      label: "Pending",
      className: "tag tag-outline",
    });
  });
});
