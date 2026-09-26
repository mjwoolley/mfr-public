---
id: CAP-038
title: Share purchases ledger
area: accounting
status: implemented
source: recovered
related: [CAP-030, CAP-040, CAP-041]
---

# Share purchases ledger

```gherkin
Feature: Share purchases ledger
  The family-wide view of all share activity, plus the admins-only visibility setting.
  Capability: CAP-038

  Scenario: The summary totals purchases, adjustments and shares outstanding
    Given I am signed in as an approved member
    And share purchases have been recorded since FY2004
    When I open "Share purchases"
    Then I see a summary like "X shares purchased since 2004, plus Y in reconciling adjustments — Z shares outstanding today."

  Scenario: Shares sold by year
    Given I am signed in as an approved member
    When I open "Share purchases"
    Then I see "Shares sold by year" with one bar per fiscal year
    And each bar counts share purchases only, not transfers, adjustments or corrected entries
    And I see "Every dollar contributed buys one share. The founding year raised the down payment."

  Scenario: Grouped by shareholder
    Given I am signed in as a member linked to a shareholder record
    When I open "Share purchases" and choose "By shareholder"
    Then I see "Share purchases and transfers by shareholder"
    And each active shareholder is listed, largest balance first, with "Purchased X · Balance Y · Z%"
    And my own group is tagged "You"
    And a shareholder with no entries shows "No entries yet."

  Scenario: Grouped by year
    Given I am signed in as an approved member
    When I choose "By year"
    Then I see "Share purchases and transfers by year"
    And each fiscal year, newest first, shows "X in new shares" and every entry with the shareholder's name

  Scenario: Corrected entries stay visible but don't count
    Given an entry has been corrected
    When I view the share purchases ledger
    Then the entry is struck through and marked "(corrected)"
    And it is left out of every total on the page

  Scenario: No purchases yet
    Given no share purchases have been recorded
    When I open "Share purchases"
    Then I see "No share purchases recorded yet."

  Scenario: An admin makes the ledger admins-only
    Given I am signed in as an accounting admin
    When I set "Share purchases tab visibility" to "Admins only"
    Then I see "Only admins can open the Share purchases tab. Shareholders still see their dashboard, ownership and expenses."
    And members who are not admins no longer see the "Share purchases" tab
    And I still see it, marked with a lock

  Scenario Outline: Members who try to open an admins-only ledger are sent somewhere useful
    Given the share purchases ledger is set to admins only
    And I am signed in as <who>
    When I try to open the share purchases ledger
    Then I am taken to <destination>

    Examples:
      | who                                            | destination              |
      | a member linked to a shareholder record        | my shareholder dashboard |
      | an approved member with no shareholder link    | the ownership report     |
```

## Open Questions

- **[medium]** The whole family can see every shareholder's full purchase history by default, including in-kind descriptions. Is that the intended privacy default? (`apps/mfr/lib/db/schema/accounting.ts:249`, `apps/mfr/app/accounting/contributions/page.tsx:32-35`)
- **[low]** Deactivated shareholders' entries appear under "By year" but have no group under "By shareholder", so the two views don't reconcile. Intended? (`apps/mfr/app/accounting/contributions/contributionsGrouping.ts:66-79`, `apps/mfr/lib/accounting/ledger.ts:51-53`)

## Related Features

- CAP-030 Accounting access and tabs — who can read the shared books
- CAP-040 Ownership report — where unlinked members are sent when the ledger is admins-only
- CAP-041 Share purchase goal — the goal sits beside the visibility setting on the admin page

## Code References

- `apps/mfr/app/accounting/contributions/page.tsx` — summary, bars, visibility redirect
- `apps/mfr/app/accounting/contributions/contributions-client.tsx` — By shareholder / By year views
- `apps/mfr/app/accounting/contributions/contributionsGrouping.ts` — grouping and totals
- `apps/mfr/app/accounting/admin/settings-cards.tsx` — "Everyone" / "Admins only" setting
- `apps/mfr/actions/accounting/settings.ts` — saves the visibility setting
- `apps/mfr/components/accounting/nav.tsx:48-56` — tab hidden or locked
- `apps/mfr/app/accounting/contributions/visibilityGate.test.ts` — redirect tests

## Change Log

- 2026-09-26 — Recovered from code.
