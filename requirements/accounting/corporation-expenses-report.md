---
id: CAP-045
title: Corporation expenses report
area: accounting
status: implemented
source: recovered
related: [CAP-030, CAP-037, CAP-044]
---

# Corporation expenses report

```gherkin
Feature: Corporation expenses report
  Everyone sees money in against money out by fiscal year
  Capability: CAP-045

  Background:
    Given I am signed in as an approved family member
    And the current fiscal year is FY2026

  Scenario: The summary line totals spending since the first expense
    Given expenses of $1,200 were recorded in FY2023 and $300 in FY2026
    When I open the Expenses tab
    Then I see the heading "Corporation expenses"
    And I see "$1,500 spent on the house since FY2023 · $300 so far in FY2026."

  Scenario: No spending yet this fiscal year
    Given expenses were recorded only in FY2024, totalling $800
    When I open the Expenses tab
    Then I see "$800 spent on the house since FY2024 · $0 so far in FY2026."

  Scenario: No expenses at all
    Given no expenses have been recorded
    When I open the Expenses tab
    Then the summary reads "No expenses recorded yet."
    And the expense log reads "No expenses recorded yet."

  Scenario: The fiscal-year explainer is shown
    When I open the Expenses tab
    Then I see "The corporation's fiscal year runs March 1 through the end of February — FY2026 is March 2026 through February 2027."

  Scenario: The yearly table compares money in and money out
    Given in FY2025 share purchases totalled 5,000 shares, operating expenses $1,200 and capital investment $2,000
    When I open the Expenses tab
    Then the FY2025 row shows "Share purchases in" $5,000, "Operating out" −$1,200, "Capital investment" −$2,000 and "Net" +$1,800
    # Share purchases count as dollars: one share is bought for one dollar.

  Scenario: A negative year is shown as a loss
    Given in FY2024 share purchases totalled 500 shares and operating expenses $900
    When I open the Expenses tab
    Then the FY2024 row shows "Net" -$400

  Scenario: A year with only one side still gets a row
    Given FY2010 had share purchases but no expenses
    When I open the Expenses tab
    Then the table has an FY2010 row
    And its "Operating out" and "Capital investment" read "—"

  Scenario: The yearly table covers the full history with an all-time total
    Given share purchases go back to FY1995
    When I open the Expenses tab
    Then the table lists every fiscal year with activity from FY1995 onward, oldest first
    And its last row, "All-time", totals each column and the net

  Scenario: Corrected share purchases don't count as money in
    Given a share purchase of 1,000 shares in FY2025 was later replaced by a correction
    When I open the Expenses tab
    Then the original 1,000 shares are not included in FY2025's "Share purchases in"

  Scenario: The chart shows recent years only
    Given there has been activity every fiscal year from FY1995 to FY2026
    When I open the Expenses tab
    Then the "Income vs. expenses by year" chart shows FY2020 through FY2026
    And earlier years appear only in the table

  Scenario: The chart skips years with no activity
    Given FY2021 had no share purchases and no expenses
    When I look at the chart
    Then FY2021 has no place on it

  Scenario: The chart's running line starts at FY2020
    Given the corporation had a net surplus of $40,000 before FY2020
    When I look at the "Cumulative change" line
    Then it counts only the net change from FY2020 onward

  Scenario: Hovering a bar shows its exact figure
    Given FY2024 operating expenses totalled $1,234
    When I hover over FY2024's operating bar
    Then I see "FY2024 · Operating expenses: $1,234"

  Scenario: The chart is left out when there is nothing recent to plot
    Given there has been no activity since FY2019
    When I open the Expenses tab
    Then no chart is shown
    But the yearly table is still shown

  Scenario: The expense log lists every expense, latest-dated first
    Given a capital "Improvements" expense "New roof" of $12,000 dated Jun 2, 2026 has been recorded
    When I view the "Expense log"
    Then its row shows "Jun 2, 2026", "New roof", "Improvements" with a "Capital" tag, and "$12,000"
    And the log ends with a "Total spent" row totalling every expense
```

## Open Questions

- **[medium]** In-kind share purchases (paid in goods or labour, not money) count toward "Share purchases in" and the net, alongside cash expenses. Should in-kind purchases be left out of money in, or shown separately? (`apps/mfr/lib/accounting/ledger.ts:135-156` has no in-kind filter)
- **[low]** When the Share purchases tab is set to admins only, this page still shows each year's share-purchase totals (no names) to everyone. Is that intended? (`apps/mfr/app/accounting/expenses/page.tsx:35-53`)

## Related Features

- CAP-030 Accounting access and tabs — any approved family member can open this tab, shareholder or not
- CAP-037 Transaction dates and fiscal year — owns the March–February fiscal year every figure here is grouped by
- CAP-044 Expense log — where admins record the expenses reported here

## Code References

- `apps/mfr/app/accounting/expenses/page.tsx` — summary line, yearly table, expense log, FY2020 chart start
- `apps/mfr/app/accounting/expenses/income-expense-chart.tsx` — chart legend and rendering
- `apps/mfr/lib/accounting/expenseChart.ts` — active years, axes, cumulative line, hover titles, shares-as-dollars note
- `apps/mfr/lib/accounting/expenses.ts` — operating/capital split by fiscal year
- `apps/mfr/lib/accounting/ledger.ts:93-156` — share purchases by fiscal year, excluding corrected entries
- `apps/mfr/components/accounting/FiscalYearNote.tsx` — explainer text
- `apps/mfr/app/accounting/reports/page.tsx` — the old Reports page now redirects to the Ownership report; there is no separate income/expense report
- `apps/mfr/tests/accounting-integration/reports.test.ts:209-330` — hand-computed figures

## Change Log

- 2026-09-26 — Recovered from code.
