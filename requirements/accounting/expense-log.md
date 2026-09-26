---
id: CAP-044
title: Expense log
area: accounting
status: implemented
source: recovered
related: [CAP-037, CAP-043, CAP-045]
---

# Expense log

```gherkin
Feature: Expense log
  Admins record, edit and delete house expenses
  Capability: CAP-044

  Background:
    Given I am signed in as an accounting admin
    And I am on the Expenses view of the accounting Admin area

  Scenario: Admin records an expense
    When I choose "Record expense"
    And I enter the description "County property tax", amount 1250.00, date incurred Sep 1, 2026, category "Taxes" and type "Operating"
    And I choose "Record expense" in the dialog
    Then the dialog closes
    And "County property tax" appears in the expense history with "$1,250" and "Sep 1, 2026"
    And it appears on the family's Corporation expenses page and in the activity log

  Scenario: A new expense starts as an operating repair
    When I choose "Record expense"
    Then the category is preset to "Repairs"
    And the type is preset to "Operating"

  Scenario: Expense categories
    When I open the category list in the expense dialog
    Then I can choose from "Taxes", "Insurance", "Utilities", "Furnishings", "Repairs", "Improvements" and "Other"

  Scenario: Capital investment is chosen separately from the category
    When I record a "Repairs" expense with type "Capital investment"
    Then it is shown with its "Repairs" category and a "Capital" tag
    And it counts as capital investment, not operating spend, in the corporation's figures

  Scenario Outline: Amount must be at least one cent
    When I try to record an expense with amount <amount>
    Then it is <result>

    Examples:
      | amount | result                              |
      | 0.01   | recorded                            |
      | 0      | refused and nothing is saved        |
      | -25    | refused and nothing is saved        |

  Scenario: Refused amounts are explained
    # The dialog's own checks normally catch this first; the message is what the admin sees if they are bypassed.
    When an expense with amount 0 reaches the server
    Then I see "Amount must be greater than zero"
    And nothing is saved

  Scenario Outline: Required details are enforced
    When I try to record an expense with <missing>
    Then the expense is refused and nothing is saved
    And, if the dialog's own checks are bypassed, I see "<message>"

    Examples:
      | missing                 | message                 |
      | a blank description     | Description is required |
      | no date incurred        | Enter a valid date      |
      | an unknown category     | Choose a category       |

  Scenario: Admin edits an expense's details
    Given "County property tax" was recorded for $1,250 dated Sep 1, 2026
    When I choose "Edit" on it
    And I change the amount to 1300.00 and the category to "Other" and choose "Save expense"
    Then the expense history shows it at "$1,300" under "Other"
    And it is still dated Sep 1, 2026

  Scenario: An expense's date can't be changed by editing
    # Keeps an expense in the fiscal year it was first reported in.
    Given an expense was recorded dated Feb 27, 2026
    When I choose "Edit" on it
    Then the date incurred is shown but can't be changed
    And I see "Edits keep the original date, so the expense stays in its year."

  Scenario: Deleting an expense asks for confirmation
    Given "County property tax" was recorded for $1,250 dated Sep 1, 2026
    When I choose "Delete" on it
    Then I am asked "Delete County property tax — $1,250 on Sep 1, 2026?"
    And I see "This permanently removes it from the expense log and the income/expense report."

  Scenario: A deleted expense is gone everywhere
    Given I have been asked to confirm deleting an expense
    When I choose "Delete expense"
    Then it no longer appears in the expense history
    And it no longer appears on the Corporation expenses page or in the activity log
    And the corporation's totals no longer include it

  Scenario: Cancelling a delete keeps the expense
    Given I have been asked to confirm deleting an expense
    When I choose "Cancel"
    Then the expense is still listed

  Scenario: Editing or deleting an expense another admin already removed
    Given another admin has just deleted an expense I still see listed
    When I try to save an edit to it or delete it
    Then I see "Expense not found"

  Scenario: The expense history lists the latest-dated expenses first
    Given expenses dated Jan 5, 2026 and Aug 20, 2026 have been recorded
    When I view the expense history
    Then the Aug 20, 2026 expense is listed above the Jan 5, 2026 expense

  Scenario: Expense amounts are shown in whole dollars
    Given an expense of 84.50 has been recorded
    When I view the expense history
    Then it is shown as "$85"

  Scenario: No expenses yet
    Given no expenses have been recorded
    When I view the expense history
    Then I see "No expenses recorded yet."

  Scenario: Only accounting admins can record expenses
    Given I am signed in as a family member who is not an accounting admin
    When I try to record, edit or delete an expense without using the admin screens
    Then my change is refused and nothing is saved
```

## Open Questions

- **[low]** A save request that leaves out the date field entirely (only possible outside the normal form) is stored as 1 January 1970 instead of being refused with "Enter a valid date"; an empty date is refused correctly. Should a missing date be refused too? (`apps/mfr/actions/accounting/expenses.ts:20`)
- **[high]** Edits and deletes leave no audit trail. An edit overwrites the amount, category and description in place without recording who changed it or what it was before. A delete removes the expense permanently. The activity log only shows when an expense was first entered, with its current values. Should changes and deletions to expenses (e.g. a tax payment) be logged, and should deletes be reversible like ledger corrections? (`apps/mfr/actions/accounting/expenses.ts:92-101`, `:109-129`; `apps/mfr/app/accounting/admin/activity/page.tsx:49-76`)
- **[medium]** A wrong date incurred can only be fixed by deleting the expense and recording it again, which also loses the original entry time and recorder. Any date is accepted when recording, including future dates and dates decades in the past. Is that the intended policy? (`apps/mfr/actions/accounting/expenses.ts:15-26`)
- **[low]** Cents are rounded away everywhere, including the delete confirmation ($84.50 shows as "$85"). Amounts also have no upper limit, so a value too large to store fails with an unexplained error rather than a message. (`apps/mfr/app/accounting/admin/expenses/page.tsx:25`; `apps/mfr/lib/accounting/format.ts:37`)

## Related Features

- CAP-043 Accounting activity log — every recorded expense appears there with who recorded it
- CAP-045 Corporation expenses report — the family-facing view of these expenses and their fiscal-year totals
- CAP-037 Transaction dates and fiscal year — expenses are grouped by the March–February fiscal year

## Code References

- `apps/mfr/actions/accounting/expenses.ts` — create/update/delete, validation messages, admin check, date kept on edit, hard delete
- `apps/mfr/app/accounting/admin/expenses/expenses-client.tsx` — dialogs, defaults, confirmation text, empty state
- `apps/mfr/app/accounting/admin/expenses/page.tsx` — history ordering and whole-dollar formatting
- `apps/mfr/lib/accounting/tags.ts:29-37` — category labels
- `apps/mfr/lib/accounting/authz.ts` — requireAdmin
- `apps/mfr/lib/db/schema/accounting.ts:213-239` — Expense record
- `apps/mfr/tests/accounting-integration/reports.test.ts:69-207`, `actionBranches.test.ts:155-240` — tests

## Change Log

- 2026-09-26 — Recovered from code.
