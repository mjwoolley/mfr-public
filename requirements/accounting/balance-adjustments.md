---
id: CAP-035
title: Balance adjustments
area: accounting
status: implemented
source: recovered
related: [CAP-032, CAP-037, CAP-039, CAP-041, CAP-042, CAP-046]
---

# Balance adjustments

```gherkin
Feature: Balance adjustments
  Reconciling credits or debits.
  Capability: CAP-035

  Background:
    Given I am signed in as an accounting admin
    And I am recording an adjustment from the share transactions screen

  Scenario Outline: An adjustment can add or remove shares
    Given the shareholder holds 100 shares
    When I enter <shares> in "Shares (use a minus sign to reduce)" with a reason
    And I choose "Record adjustment"
    Then the shareholder holds <balance> shares

    Examples:
      | shares | balance |
      | 25     | 125     |
      | -25    | 75      |

  Scenario: An adjustment needs a reason
    When I record an adjustment with no reason
    Then I am told "A description is required"
    And nothing is recorded

  Scenario: A zero adjustment is refused
    When I enter 0 shares
    Then I am told "Shares must not be zero"
    And nothing is recorded

  Scenario: Adjustments are counted separately from purchases
    When I record an adjustment of 25 shares
    Then it is tagged "Adjustment", not "Share purchase"
    And it is not counted as shares purchased or toward the share purchase goal

  Scenario: Only active shareholders can be adjusted
    Given a shareholder record has been deactivated
    When I try to record an adjustment for them
    Then I am told "Shareholder not found or inactive"
```

## Open Questions

- **[low]** An adjustment can take a shareholder below zero. That is probably fine for reconciling old records, but should it be allowed? (`apps/mfr/actions/accounting/adjustments.ts:19-23`)

## Related Features

- CAP-032 Transaction approvals and disputes — each adjustment waits for the shareholder's approval
- CAP-037 Transaction dates and fiscal year — adjustments can be back-dated "as of" a past date
- CAP-039 Ledger email notifications — the shareholder is emailed
- CAP-046 Shareholder records — inactive shareholders can't receive adjustments
- CAP-042 Share transaction history — adjustments are recorded from the history screen
- CAP-041 Share purchase goal — adjustments don't count toward the goal

## Code References

- `apps/mfr/actions/accounting/adjustments.ts` — validation, recording, email
- `apps/mfr/app/accounting/admin/transactions/transactions-client.tsx:353-365` — adjustment dialog
- `apps/mfr/app/accounting/contributions/page.tsx:70-80` — adjustments totalled separately
- `apps/mfr/tests/accounting-integration/actionBranches.test.ts:362-375` — validation

## Change Log

- 2026-09-26 — Recovered from code.
