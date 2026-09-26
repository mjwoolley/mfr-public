---
id: CAP-034
title: Share transfers
area: accounting
status: implemented
source: recovered
related: [CAP-032, CAP-037, CAP-039, CAP-040, CAP-042, CAP-046]
---

# Share transfers

```gherkin
Feature: Share transfers
  Move shares between shareholders.
  Capability: CAP-034

  Background:
    Given I am signed in as an accounting admin
    And I am recording a transfer from the share transactions screen

  Scenario: A transfer moves shares from one shareholder to another
    Given "Anna Miller" holds 250 shares
    When I choose From "Anna Miller", To "Ben Miller", 100 shares and the description "e2e transfer"
    And I choose "Record transfer"
    Then the history lists "Anna Miller → Ben Miller · 100"
    And "Anna Miller" now holds 150 shares
    And "Ben Miller" holds 100 more shares
    And the total shares outstanding is unchanged

  Scenario: Both parties are asked to approve the transfer
    When I record a transfer between two shareholders
    Then the transfer waits for approval from both of them

  Scenario: A transfer needs a description
    When I record a transfer with no description
    Then I am told "A description is required"
    And nothing is recorded

  Scenario: A shareholder cannot transfer to themselves
    When I choose the same shareholder as From and To
    Then I am told "From and to shareholders must be different"

  Scenario Outline: Missing or invalid choices are refused
    When I record a transfer with <problem>
    Then I am told "<message>"

    Examples:
      | problem                   | message                                  |
      | no From shareholder       | Select who the shares are coming from    |
      | no To shareholder         | Select who the shares are going to       |
      | 0 shares                  | Shares must be greater than zero         |

  Scenario: Both parties must be active shareholders
    Given one of the two shareholder records has been deactivated
    When I try to record a transfer involving them
    Then I am told "Shareholder not found or inactive"
    And nothing is recorded
```

## Open Questions

- **[medium]** A transfer can take a shareholder below zero: nothing checks that the sender holds enough shares. The ownership report then hides the negative holder (see CAP-040). Should transfers be limited to the sender's current balance? (`apps/mfr/actions/accounting/transfers.ts:55-106`)

## Related Features

- CAP-032 Transaction approvals and disputes — both parties get an approval
- CAP-037 Transaction dates and fiscal year — the transfer date and back-dating
- CAP-039 Ledger email notifications — both parties are emailed
- CAP-046 Shareholder records — only active records can take part
- CAP-042 Share transaction history — transfers are recorded from the history screen
- CAP-040 Ownership report — transfers can leave negative balances hidden from the report

## Code References

- `apps/mfr/actions/accounting/transfers.ts` — validation, paired entries, both approvals, emails
- `apps/mfr/app/accounting/admin/transactions/transactions-client.tsx:336-351` — transfer dialog
- `apps/mfr/app/accounting/admin/transactions/page.tsx:39-42` — "A → B · N" history line
- `apps/mfr/tests/accounting-integration/actionBranches.test.ts:341-360` — lookup failures
- `e2e/tests/accounting-flows.spec.ts` — transfer through the UI

## Change Log

- 2026-09-26 — Recovered from code.
