---
id: CAP-031
title: Shareholder dashboard
area: accounting
status: implemented
source: recovered
related: [CAP-030, CAP-032, CAP-036, CAP-041, CAP-047]
---

# Shareholder dashboard

```gherkin
Feature: Shareholder dashboard
  My shares, ownership %, the goal and my history.
  Capability: CAP-031

  Background:
    Given I am signed in as a member linked to a shareholder record

  Scenario: I see my shares and my ownership of the house
    Given my shareholder record holds 250 shares
    And 1,000 shares are outstanding in total
    When I open my dashboard
    Then I see "Welcome back" and my shareholder name
    And I see "Shares currently owned" as 250 with "Each $1 contributed buys 1 share"
    And I see "Your ownership" as "25.0%" "of the lake house"

  Scenario: My history lists every entry that touched me, newest date first
    Given I have a share purchase dated 3 January and a transfer dated 5 February
    When I open my dashboard
    Then under "Your share purchase history" the transfer is listed above the share purchase
    And each entry shows its type, signed share count, date and description

  Scenario: A back-dated entry shows its business date
    Given an admin recorded a share purchase for me dated yesterday
    When I open my dashboard
    Then the entry shows yesterday's date, not today's

  Scenario: Each entry shows where my approval stands
    Given I have entries I have confirmed, disputed and not yet reviewed
    When I open my dashboard
    Then they are tagged "Approved", "Disputed" and "Pending your approval" respectively

  Scenario: A corrected entry stays visible but no longer counts
    Given one of my entries has been replaced by a correction
    When I open my dashboard
    Then that entry is shown struck through with "Corrected — excluded from your totals."
    And the correction is listed with a note naming the entry it corrects

  Scenario: In-kind purchases are flagged
    Given an admin recorded an in-kind share purchase for me
    When I open my dashboard
    Then that entry is tagged "In kind"

  Scenario: Empty history
    Given no entries have ever been recorded for me
    When I open my dashboard
    Then I see "No share purchases yet."
```

## Open Questions

- **[medium]** My dashboard stays available after an admin deactivates my shareholder record. Should a deactivated shareholder keep their dashboard and inbox? (`apps/mfr/lib/accounting/authz.ts:60-64`, `apps/mfr/lib/auth.ts:43-86`)
- **[low]** "Your ownership" divides by the total outstanding, which includes inactive shareholders' holdings. That differs from what the ownership report lists (see CAP-040). Intended? (`apps/mfr/app/accounting/dashboard/page.tsx:81`)

## Related Features

- CAP-030 Accounting access and tabs — only linked shareholders get this view
- CAP-032 Transaction approvals and disputes — the approval tags and dispute controls shown on each entry
- CAP-036 Transaction corrections — corrected entries appear struck through
- CAP-041 Share purchase goal — the goal tracker shown on this page
- CAP-047 Link logins to shareholders — decides which shareholder record I see

## Code References

- `apps/mfr/app/accounting/dashboard/page.tsx` — stats, history, approval tags, dispute block
- `apps/mfr/app/accounting/dashboard/dispute-actions.tsx` — "Confirm anyway" / "Edit reason"
- `apps/mfr/lib/accounting/ledger.ts:31-47` — balance and total outstanding
- `e2e/tests/accounting-flows.spec.ts` — balances and back-dated entries on the dashboard

## Change Log

- 2026-09-26 — Recovered from code.
