---
id: CAP-036
title: Transaction corrections
area: accounting
status: implemented
source: recovered
related: [CAP-031, CAP-032, CAP-037, CAP-039, CAP-040, CAP-042]
---

# Transaction corrections

```gherkin
Feature: Transaction corrections
  Replace a mistaken entry without rewriting history.
  Capability: CAP-036

  Background:
    Given I am signed in as an accounting admin

  Scenario: The correction form explains what will happen
    Given a transfer of 100 shares from "Anna Miller" to "Ben Miller" is in the history
    When I choose "Correct" on it
    Then I see that the original "will be marked corrected (shown struck through, excluded from totals)"
    And there is one share amount to fill in for each shareholder on the original, each labelled with its original amount
    And a description is required

  Scenario: The original stays visible but stops counting
    # The only way to change a recorded entry; nothing is edited or removed.
    Given I have recorded a correction for a transaction
    Then the original is marked corrected and shown struck through everywhere it is listed
    And the original no longer counts toward any balance, total or fiscal-year figure
    And the correction's own amounts count in its place
    And the correction notes which transaction it corrects

  Scenario: A corrected transaction cannot be corrected again from its history row
    Given a transaction has already been corrected
    When I view it in the share transaction history
    Then it shows "Corrected" and offers no "Correct" button

  Scenario: The correction keeps the original's fiscal year by default
    Given the original transaction is dated 15 January 2020
    When I open its correction form
    Then the date defaults to 15 January 2020
    And the hint says it lands in "FY2019"

  Scenario: Every shareholder on the original needs a non-zero amount
    When I set the amount for "Anna Miller" to 0
    And I choose "Record correction"
    Then I am told "Enter a non-zero correction amount for Anna Miller"
    And nothing is recorded

  Scenario: A correction needs a description
    When I record a correction with no description
    Then I am told "A description is required"
    And nothing is recorded

  Scenario: Affected shareholders are asked to approve the correction
    When I record a correction
    Then each shareholder on the original has the correction waiting in their inbox

  Scenario: An admin can go straight to a disputed entry's correction
    Given a shareholder has disputed an entry
    When I choose "Issue correction" on the dispute
    Then the correction form opens for that entry
```

## Open Questions

- **[high]** Accepting the default amounts reverses a transaction twice. The form says "Amounts default to a full reversal" and pre-fills the negative of each original amount. But the original is also marked corrected and stops counting, so the correction's amounts _replace_ it rather than cancel it. Worked example (the e2e scenario): Anna Miller buys 250; 100 is transferred to Ben Miller; the transfer is corrected with the defaults (+100 for Member, −100 for Transferee). Balances end at Member 350 / Transferee −100, not 250 / 0. The e2e test comments claim 250 / 0, but its checks are too loose to notice. Also, since zero amounts are refused, there is no way to fully void a mistaken transaction. Should the defaults be the original amounts, or should corrections go back to being deltas? (`apps/mfr/app/accounting/admin/transactions/transactions-client.tsx:374-398`, `apps/mfr/actions/accounting/corrections.ts:62-117`, `e2e/tests/accounting-flows.spec.ts:103-127,180-194`; the soft-delete behaviour was added in commit 8826e8c)
- **[high]** A transaction can be corrected twice, and both corrections count. The server never checks whether the original was already corrected. The correction form still opens for an already-corrected transaction from a direct link or from "Issue correction" on its dispute. (`apps/mfr/actions/accounting/corrections.ts:51-57`, `apps/mfr/app/accounting/admin/transactions/transactions-client.tsx:239-244`, `apps/mfr/app/accounting/admin/activity/page.tsx:166-173`)
- **[low]** A correction can only name the shareholders on the original. Moving a mistaken purchase to the right person needs a correction plus a new purchase. Intended? (`apps/mfr/actions/accounting/corrections.ts:62-70`)

## Related Features

- CAP-031 Shareholder dashboard — corrected entries appear struck through with "Corrected — excluded from your totals."
- CAP-032 Transaction approvals and disputes — corrections create approvals and usually answer a dispute
- CAP-037 Transaction dates and fiscal year — the correction's date and its fiscal year
- CAP-039 Ledger email notifications — affected shareholders are emailed
- CAP-042 Share transaction history — where "Correct" is offered and corrected rows are shown
- CAP-040 Ownership report — corrections change the balances the report shows

## Code References

- `apps/mfr/actions/accounting/corrections.ts` — validation, recording, marking the original corrected, emails
- `apps/mfr/app/accounting/admin/transactions/transactions-client.tsx:367-403` — correction form and defaults
- `apps/mfr/app/accounting/admin/transactions/[id]/correct/page.tsx` — old correction address opens the form
- `apps/mfr/lib/accounting/ledger.ts` — every total excludes corrected originals
- `apps/mfr/tests/accounting-integration/actionBranches.test.ts:282-340` — correction validation

## Change Log

- 2026-09-26 — Recovered from code.
