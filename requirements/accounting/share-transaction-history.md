---
id: CAP-042
title: Share transaction history
area: accounting
status: implemented
source: recovered
related: [CAP-033, CAP-034, CAP-035, CAP-036, CAP-043]
---

# Share transaction history

```gherkin
Feature: Share transaction history
  Admin list of every transaction and its approval state.
  Capability: CAP-042

  Background:
    Given I am signed in as an accounting admin
    And I am on the share transactions screen

  Scenario: Recording starts from the history
    Then I see "Record share purchase", "Record transfer" and "Record adjustment"
    And each opens a form that closes and updates the history once the entry is recorded

  Scenario: Every transaction is listed, newest date first
    Given a share purchase dated last week and a transfer dated yesterday
    Then under "History" the transfer is listed above the share purchase
    And each shows its type, date and description

  Scenario: Entries read as share counts
    Given a share purchase of 250 shares for "Anna Miller"
    And a transfer of 100 shares from "Anna Miller" to "Ben Miller"
    Then I see "Anna Miller +250"
    And I see "Anna Miller → Ben Miller · 100"
    And no dollar amounts are shown

  Scenario: Each shareholder's approval state is shown
    Given a transfer that one party has confirmed and the other has not reviewed
    Then it shows "<first party> · Confirmed" and "<second party> · Pending"

  Scenario: Corrected transactions are struck through and can't be corrected again
    Given a transaction has been corrected
    Then it is shown struck through and tagged "Corrected"
    And it has no "Correct" button
    And the correction shows which transaction it corrects

  Scenario: In-kind purchases are flagged
    Given an in-kind share purchase has been recorded
    Then it is tagged "In kind"

  Scenario: Only active shareholders can be chosen in the forms
    Given a shareholder record has been deactivated
    When I open any of the record forms
    Then that shareholder is not offered

  Scenario: Empty history
    Given no share transactions have been recorded
    Then I see "No transactions yet."
```

## Open Questions

- **[low]** The history is ordered by business date, so a newly back-dated entry can appear far down the list. The activity log orders by entry time instead (CAP-043). Is business-date order right here? (`apps/mfr/app/accounting/admin/transactions/page.tsx:22`)

## Related Features

- CAP-036 Transaction corrections — "Correct" is offered from each row
- CAP-043 Accounting activity log — the same transactions in the order they were entered, with disputes
- CAP-033 Record a share purchase — share purchases are recorded from the history screen
- CAP-034 Share transfers — transfers are recorded from the history screen
- CAP-035 Balance adjustments — adjustments are recorded from the history screen

## Code References

- `apps/mfr/app/accounting/admin/transactions/page.tsx` — list query and row lines
- `apps/mfr/app/accounting/admin/transactions/transactions-client.tsx:230-323` — record buttons, history cards, empty state
- `apps/mfr/app/accounting/admin/transactions/new/*/page.tsx` — old record addresses open this screen
- `apps/mfr/lib/accounting/tags.ts` — type and approval labels
- `e2e/tests/accounting-flows.spec.ts` — history lines

## Change Log

- 2026-09-26 — Recovered from code.
