---
id: CAP-037
title: Transaction dates and fiscal year
area: accounting
status: implemented
source: recovered
related: [CAP-033, CAP-034, CAP-035, CAP-036, CAP-041, CAP-044, CAP-045]
---

# Transaction dates and fiscal year

```gherkin
Feature: Transaction dates and fiscal year
  Back-date entries into the right March-February fiscal year (owns the fiscal-year rule).
  Capability: CAP-037

  # Owns the fiscal-year rule for every year-based figure in Accounting:
  # share purchases by year, the goal, expenses and the income/expense chart.

  Scenario Outline: The fiscal year runs 1 March to the end of February
    Given I am signed in as an accounting admin
    When I record a share purchase dated <date>
    Then it counts in <fiscal year>

    Examples:
      | date             | fiscal year |
      | 28 February 2019 | FY2018      |
      | 29 February 2020 | FY2019      |
      | 1 March 2020     | FY2020      |
      | 31 December 2020 | FY2020      |
      | 28 February 2021 | FY2020      |

  Scenario: The fiscal year is named by the year it starts in
    Given I am viewing any Accounting page that groups figures by year
    Then I see "The corporation's fiscal year runs March 1 through the end of February" with the current year as an example, such as "FY2026 is March 2026 through February 2027"

  Scenario: Share transactions default to today
    Given I am signed in as an accounting admin
    When I open the form for a share purchase, transfer or adjustment
    Then the date is set to today

  Scenario: The form says which fiscal year a date lands in
    Given I am signed in as an accounting admin
    When I set a share transaction's date to 15 January 2025
    Then I see "Lands in FY2024 (Mar 2024 – Feb 2025)"

  Scenario: A back-dated entry keeps the day I chose
    Given I am signed in as an accounting admin
    When I record a share purchase dated yesterday
    Then the shareholder sees yesterday's date on the entry, not today's
    And the entry counts in yesterday's fiscal year

  Scenario: Share transactions cannot be dated in the future
    Given I am signed in as an accounting admin
    When I try to record a share transaction dated tomorrow
    Then I am told "A share transaction cannot be dated in the future"
    And nothing is recorded

  Scenario: Impossible dates are refused
    Given I am signed in as an accounting admin
    When I try to record a share transaction dated 31 February 2025
    Then I am told "Enter a valid date"
    And nothing is recorded

  Scenario: A later date change always moves the figure with it
    # No fiscal year is stored separately, so a corrected date can never disagree with the year it counts in.
    Given I am signed in as an accounting admin
    And a share purchase is dated 10 February 2021
    When I correct it with the date 10 March 2021
    Then the correction's shares count in FY2021
    And the original's shares no longer count in FY2020
```

## Open Questions

- **[low]** Dates are decided in UTC. An entry recorded "today" on a US evening is stored and shown as the next day. On the evening of the last day of February that puts it in the next fiscal year. Also, the correction form's default date can then be later than the form allows, until local midnight. Should "today" follow the family's local time zone? (`apps/mfr/lib/accounting/transactionDate.ts:29-34`, `apps/mfr/lib/accounting/format.ts:48-53`, `apps/mfr/app/accounting/admin/transactions/page.tsx:55`)

## Related Features

- CAP-033 Record a share purchase — purchases can be back-dated
- CAP-034 Share transfers — transfers can be back-dated
- CAP-035 Balance adjustments — adjustments can be back-dated
- CAP-036 Transaction corrections — a correction defaults to the original's date
- CAP-041 Share purchase goal — the goal and "raised" figure are per fiscal year
- CAP-045 Corporation expenses report — expenses bucket by the same fiscal year
- CAP-044 Expense log — expenses are grouped by the March–February fiscal year

## Code References

- `apps/mfr/lib/accounting/fiscalYear.ts` — fiscal-year rule, label, date range
- `apps/mfr/lib/accounting/transactionDate.ts` — date parsing, future/invalid refusal, hint text
- `apps/mfr/app/accounting/admin/transactions/transactions-client.tsx:136-167` — date field and "Lands in" hint
- `apps/mfr/components/accounting/FiscalYearNote.tsx` — fiscal-year explainer
- `apps/mfr/tests/accounting-integration/shareTransactionDates.test.ts` — boundary and refusal tests
- `apps/mfr/lib/accounting/fiscalYear.test.ts`, `transactionDate.test.ts` — unit tests

## Change Log

- 2026-09-26 — Recovered from code.
