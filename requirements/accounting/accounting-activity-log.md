---
id: CAP-043
title: Accounting activity log
area: accounting
status: implemented
source: recovered
related: [CAP-004, CAP-032, CAP-042, CAP-044]
---

# Accounting activity log

```gherkin
Feature: Accounting activity log
  Admin audit trail of transactions and expenses in the order entered
  Capability: CAP-043

  Background:
    Given I am signed in as an accounting admin
    And I am on the Activity view of the accounting Admin area

  Scenario: Share transactions and expenses appear together in one log
    Given a share purchase and a house expense have both been recorded
    When I look at the activity log
    Then I see a card for the share purchase
    And I see a card for the expense in the same list
    And I see "Every transaction on the ledger — with each shareholder's confirmation status and any open disputes — alongside every recorded expense, in the order entries were made."

  Scenario: The log is ordered by when each entry was made, not by its date
    Given yesterday an admin recorded an expense dated last week
    And today an admin recorded a share purchase back-dated to last year
    When I look at the activity log
    Then the share purchase is listed above the expense
    And each card shows the date it was dated to on a "Dated …" line

  Scenario: A share transaction and an expense entered at the same moment
    Given a share transaction and an expense carry exactly the same entry time
    When I look at the activity log
    Then the share transaction is listed above the expense

  Scenario: Entry times are shown in my own time zone
    Given an entry was made at 11:30 pm Eastern time
    When I view the log from a device set to Eastern time
    Then its card shows that date and "11:30 PM"
    # The "Dated" business date is always shown as the calendar day it was dated to, whatever my time zone.

  Scenario: An expense card shows what was spent and who recorded it
    Given an admin named "Pat Miller" recorded a capital "Taxes" expense of $1,250 described "County property tax" dated Sep 1, 2026
    When I look at the activity log
    Then its card is labelled "Expense · Taxes" with a "Capital" tag
    And it shows "$1,250" and "County property tax"
    And it shows "Dated Sep 1, 2026 · Recorded by Pat Miller"

  Scenario Outline: Who recorded an entry falls back when details are missing
    Given an entry was recorded by an admin whose name is <name> and whose email is <email>
    When I look at the activity log
    Then its card ends with "Recorded by <shown>"

    Examples:
      | name       | email          | shown          |
      | Pat Miller | pat@family.org | Pat Miller     |
      | not known  | pat@family.org | pat@family.org |
      | not known  | not known      | an admin       |

  Scenario: A transaction card shows each shareholder's share movement
    Given 100 shares were transferred from "Ann Miller" to "Bob Miller"
    When I look at the activity log
    Then its card is labelled "Transfer"
    And it shows "Ann Miller -100" and "Bob Miller +100" on one line, separated by " · "

  Scenario: An in-kind share purchase is marked as such
    Given a share purchase was paid in goods or labour
    When I look at the activity log
    Then its card carries an "In kind" tag next to "Share purchase"

  Scenario: Each shareholder's confirmation status is shown on the card
    Given a transaction affects "Ann Miller", who has confirmed it, and "Bob Miller", who has not yet responded
    When I look at the activity log
    Then its card shows "Ann Miller · Confirmed" and "Bob Miller · Pending"

  Scenario: An open dispute is shown with ways to act on it
    Given "Bob Miller" disputed a transaction saying "I paid 200, not 100"
    And the dispute has not been resolved
    When I look at the activity log
    Then its card shows "Bob Miller · Disputed"
    And it shows "Bob Miller disputed: I paid 200, not 100"
    And I am offered "Issue correction" and a way to mark the dispute resolved

  Scenario: A resolved dispute stays visible on the card
    Given "Bob Miller"'s dispute was resolved on Sep 3, 2026 by a correction
    When I look at the activity log
    Then its card shows "Bob Miller · Disputed (resolved)"
    And it shows "Resolved Sep 3, 2026" followed by a reference to the correction

  Scenario: A live transaction can be corrected from the log
    Given a transaction has not been corrected
    When I choose "Correct" on its card
    Then I am taken to the correction form for that transaction

  Scenario: A corrected transaction is struck through and can't be corrected again
    Given a transaction has been replaced by a correction
    When I look at the activity log
    Then its card carries a "Corrected" tag
    And its share movements are struck through
    But it offers no "Correct" link

  Scenario: A correction points back to the entry it corrects
    Given a correction was recorded against a transfer
    When I look at the activity log
    Then the correction's card is labelled "Correction"
    And it shows a reference to the transfer it corrects

  Scenario: A newly recorded expense appears straight away
    Given an admin has just recorded an expense
    When I open the activity log
    Then the new expense is at the top of the log

  Scenario: The log with nothing in it
    Given no transactions or expenses have been recorded
    When I look at the activity log
    Then I see "No activity yet."
```

## Open Questions

- **[low]** A correction's card reads "Corrects TRANSFER #a1b2c3", which uses the internal type name in capitals rather than the family-facing label ("Transfer", "Share purchase") used everywhere else. (`apps/mfr/app/accounting/admin/activity/page.tsx:114-118`)
- **[medium]** The log loads every transaction and every expense ever recorded on one page, with no paging, date range or filter. Is that acceptable as the history grows, or should it page or filter by fiscal year? (`apps/mfr/app/accounting/admin/activity/page.tsx:27-37`)

## Related Features

- CAP-032 Transaction approvals and disputes — owns the confirm/dispute/resolve rules whose state this log displays and whose resolve control it hosts
- CAP-042 Share transaction history — the "Correct" link opens its correction form; it lists the same transactions by date
- CAP-044 Expense log — the expenses shown here, and who recorded them
- CAP-004 Admin roles — only accounting admins see the activity log

## Code References

- `apps/mfr/app/accounting/admin/activity/page.tsx` — the log page, transaction and expense cards
- `apps/mfr/lib/accounting/activityFeed.ts` — merge and order by entry time, tie-break
- `apps/mfr/app/accounting/admin/activity/LocalDateTime.tsx` — entry time in the viewer's time zone
- `apps/mfr/app/accounting/admin/activity/resolve-dispute-form.tsx` — resolve control (rules in CAP-032)
- `apps/mfr/lib/accounting/tags.ts` — type, category, approval and "In kind" labels
- `apps/mfr/app/accounting/page.tsx`, `apps/mfr/app/accounting/activity/page.tsx` — admins land on this view
- `apps/mfr/lib/db/schema/accounting.ts` — Transaction.enteredAt (entry time), migration `apps/mfr/drizzle/0003_mushy_johnny_storm.sql`

## Change Log

- 2026-09-26 — Recovered from code.
