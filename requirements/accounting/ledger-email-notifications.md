---
id: CAP-039
title: Ledger email notifications
area: accounting
status: implemented
source: recovered
related: [CAP-010, CAP-033, CAP-034, CAP-035, CAP-036]
---

# Ledger email notifications

```gherkin
Feature: Ledger email notifications
  Affected shareholders are emailed when an admin records something.
  Capability: CAP-039

  # Whether an email really leaves a non-production environment is owned by CAP-010.

  Scenario: A share purchase is emailed to the shareholder
    Given an admin records a share purchase of 500 shares for a shareholder with an email address
    Then the shareholder receives "Share purchase of 500 shares recorded"
    And it says who recorded it, for how many shares and on what date
    And it links to "Review and acknowledge in your inbox"

  Scenario: An in-kind purchase email says what was contributed
    Given an admin records an in-kind share purchase described as "deck lumber and two days of labour"
    Then the email says "In kind — goods or services rather than cash."
    And it includes "deck lumber and two days of labour"

  Scenario: Both parties to a transfer are emailed
    Given an admin records a transfer of 10 shares from Dana Brown to Sam Lee, both with email addresses
    Then Dana receives "Transfer of 10 shares to Sam Lee recorded", worded "from you to Sam Lee"
    And Sam receives "Transfer of 10 shares from Dana Brown recorded", worded "from Dana Brown to you"
    And both emails include the reason

  Scenario Outline: Adjustments and corrections are emailed with their reason
    Given an admin records <what> of <shares> shares for a shareholder with an email address
    Then the shareholder receives "<subject>"
    And the email includes the reason the admin gave

    Examples:
      | what          | shares | subject                                   |
      | an adjustment | 25     | Balance adjustment of 25 shares recorded  |
      | a correction  | -90    | Correction of -90 shares recorded         |

  Scenario: Replies go to the admin who recorded the entry
    Given an admin records any share transaction that emails a shareholder
    Then replying to the email reaches that admin
    And the email ends "If this doesn't look right, just reply to this email."

  Scenario: Shareholders without an email address are skipped
    Given a shareholder record has no email address
    When an admin records a share transaction for them
    Then the transaction is recorded
    And no email is sent for that shareholder

  Scenario: An email failure never undoes the entry
    Given the email service is unavailable
    When an admin records a share transaction
    Then the transaction is still recorded and the admin sees it succeed

  Scenario: Approving or disputing sends no email
    When a shareholder confirms or disputes an entry, or an admin resolves a dispute
    Then no email is sent
```

## Open Questions

- **[medium]** Transfer, adjustment and correction emails say the word twice, e.g. "an adjustment of 25 shares shares to your balance". The amount is passed in with "shares" already attached. (`apps/mfr/actions/accounting/adjustments.ts:88`, `transfers.ts:109`, `corrections.ts:135`, `apps/mfr/emails/accounting/AdjustmentNotification.tsx`, `TransferNotification.tsx`, `CorrectionNotification.tsx`)
- **[medium]** The correction email says "a correction of -90 shares to your balance … correcting an earlier … entry", which reads as a change of −90. In fact the amount replaces the original entry (see CAP-036). Should the wording show the old and new amounts? (`apps/mfr/emails/accounting/CorrectionNotification.tsx`)

## Related Features

- CAP-010 Email safety outside production — owns whether real recipients are ever emailed
- CAP-033 Record a share purchase — sends the purchase email
- CAP-034 Share transfers — sends both transfer emails
- CAP-035 Balance adjustments — sends the adjustment email
- CAP-036 Transaction corrections — sends a correction email to each affected shareholder

## Code References

- `apps/mfr/lib/accounting/email.ts` — sending, reply-to, failures logged and swallowed
- `apps/mfr/emails/accounting/*.tsx` — the four templates
- `apps/mfr/actions/accounting/contributions.ts:105-121`, `transfers.ts:108-148`, `adjustments.ts:81-96`, `corrections.ts:122-145` — subjects and recipients
- `apps/mfr/emails/accounting/templates.test.ts`, `apps/mfr/tests/accounting-integration/emails.test.ts` — email tests

## Change Log

- 2026-09-26 — Recovered from code.
