---
id: CAP-033
title: Record a share purchase
area: accounting
status: implemented
source: recovered
related: [CAP-032, CAP-037, CAP-039, CAP-041, CAP-042, CAP-046]
---

# Record a share purchase

```gherkin
Feature: Record a share purchase
  Cash or in-kind contributions become shares.
  Capability: CAP-033

  Background:
    Given I am signed in as an accounting admin
    And I am recording a share purchase from the share transactions screen

  Scenario: A cash purchase buys one share per dollar
    When I choose the shareholder "Anna Miller", enter 250 shares and the description "e2e seed contribution"
    And I choose "Record share purchase"
    Then the history lists "Anna Miller +250" as a share count, not a dollar amount
    And the shareholder's balance goes up by 250 shares

  Scenario: The description is optional for a cash purchase
    When I record a cash purchase of 100 shares with no description
    Then the purchase is recorded

  Scenario: An in-kind purchase needs a description
    When I tick "In kind (goods or services, not cash)" and leave the description empty
    And I choose "Record share purchase"
    Then I am told "A description is required for an in-kind share purchase"
    And nothing is recorded

  Scenario: An in-kind purchase is flagged everywhere
    When I record 40 shares in kind with the description "deck lumber and two days of labour"
    Then the purchase is tagged "In kind" in the history, on the shareholder's dashboard and in their inbox

  Scenario Outline: Share count must be positive
    When I enter <shares> shares and choose "Record share purchase"
    Then I am told "Shares must be greater than zero"
    And nothing is recorded

    Examples:
      | shares |
      | 0      |
      | -5     |

  Scenario: A shareholder must be chosen
    When I record a purchase without choosing a shareholder
    Then I am told "Select a shareholder"

  Scenario: Only active shareholders can buy shares
    Given a shareholder record has been deactivated
    When I try to record a purchase for them
    Then I am told "Shareholder not found or inactive"
    And nothing is recorded
```

## Open Questions

- **[low]** Share counts with more than two decimal places (e.g. 0.004) get past the server's check and are rounded when stored, so a purchase can be saved as 0 shares. Only the form's 0.01 step prevents this today. Should the server refuse them? (`apps/mfr/actions/accounting/contributions.ts:27`, `apps/mfr/lib/db/schema/accounting.ts:139`)

## Related Features

- CAP-032 Transaction approvals and disputes — each purchase waits for the shareholder's approval
- CAP-037 Transaction dates and fiscal year — the purchase date and back-dating
- CAP-039 Ledger email notifications — the shareholder is emailed about the purchase
- CAP-041 Share purchase goal — purchases count toward this fiscal year's goal
- CAP-046 Shareholder records — inactive shareholders can't receive share purchases
- CAP-042 Share transaction history — share purchases are recorded from the history screen

## Code References

- `apps/mfr/actions/accounting/contributions.ts` — validation, recording, email
- `apps/mfr/app/accounting/admin/transactions/transactions-client.tsx:119-221,325-334` — purchase dialog and In kind checkbox
- `apps/mfr/tests/accounting-integration/inKind.test.ts` — in-kind rules
- `apps/mfr/tests/accounting-integration/actionBranches.test.ts:238-280` — validation branches
- `e2e/tests/accounting-flows.spec.ts` — recording through the UI

## Change Log

- 2026-09-26 — Recovered from code.
