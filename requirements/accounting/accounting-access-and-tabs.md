---
id: CAP-030
title: Accounting access and tabs
area: accounting
status: implemented
source: recovered
related: [CAP-003, CAP-004, CAP-031, CAP-038, CAP-040, CAP-045, CAP-047]
---

# Accounting access and tabs

```gherkin
Feature: Accounting access and tabs
  The whole family reads the books; a linked shareholder gets personal views (owns who sees whose finances).
  Capability: CAP-030

  # The approval gate itself (signed out, pending, blocked) is owned by CAP-003;
  # who counts as an accounting admin is owned by CAP-004.

  Scenario: The shared books are open to every approved member
    # "The books are open to the whole family" — whether or not I am linked to a shareholder record.
    Given I am signed in as an approved member who is not linked to a shareholder record
    When I open the share purchases, ownership or expenses views
    Then I can read each of them

  Scenario Outline: Where I land when I open Accounting
    Given I am signed in as <who>
    When I open Accounting
    Then I land on <landing>

    Examples:
      | who                                             | landing                        |
      | an accounting admin                             | the admin activity log         |
      | a member linked to a shareholder record         | my shareholder dashboard       |
      | an approved member with no shareholder link     | the share purchases ledger     |

  Scenario: Personal views are only for linked shareholders
    Given I am signed in as an approved member who is not linked to a shareholder record
    When I try to open the shareholder dashboard or the approval inbox
    Then I see "Not authorized"
    And I am told my email "isn't set up as a shareholder yet. Contact the corporation administrator to be added."

  Scenario: Being an admin does not unlock personal views
    Given I am signed in as an accounting admin who is not linked to a shareholder record
    When I try to open the shareholder dashboard
    Then I see "Not authorized"

  Scenario: Admin pages are only for accounting admins
    Given I am signed in as a member who is not an accounting admin
    When I try to open any admin page in Accounting
    Then I see "Not authorized"
    And nothing admin-only is shown to me

  Scenario: A linked shareholder sees their personal tabs
    Given I am signed in as a member linked to a shareholder record
    And 2 entries are waiting for my approval
    When I view the Accounting tabs
    Then I see "Dashboard" and "Inbox" tabs
    And the "Inbox" tab shows a count of 2

  Scenario: An unlinked member does not see personal tabs
    Given I am signed in as an approved member who is not linked to a shareholder record
    When I view the Accounting tabs
    Then I do not see "Dashboard" or "Inbox" tabs
    And I see "Share purchases", "Ownership" and "Expenses" tabs

  Scenario: Accounting admins see a locked Admin tab
    Given I am signed in as an accounting admin
    When I view the Accounting tabs
    Then I see an "Admin" tab marked with a lock
```

## Open Questions

- **[low]** A linked shareholder who is not an admin and opens an admin page is told their email "isn't set up as a shareholder yet", which is untrue for them. Should the admin refusal have its own message? (`apps/mfr/lib/accounting/authz.ts:55`, `apps/mfr/app/accounting/unauthorized/page.tsx`)
- **[low]** Signing in from any Accounting page returns me to the Accounting landing, not the page I originally asked for. Intended? (`apps/mfr/lib/accounting/authz.ts:7`)

## Related Features

- CAP-003 Access for unapproved accounts — the approval gate every Accounting page sits behind
- CAP-004 Admin roles — defines who is an accounting admin (accounting manager or site owner)
- CAP-031 Shareholder dashboard — the personal view a linked shareholder lands on
- CAP-038 Share purchases ledger — where an unlinked member lands; its tab can be made admins-only
- CAP-040 Ownership report — part of the shared books everyone can read
- CAP-045 Corporation expenses report — part of the shared books everyone can read
- CAP-047 Link logins to shareholders — the link that unlocks the personal views

## Code References

- `apps/mfr/lib/accounting/authz.ts:36-64` — access levels: shared books, admin, linked shareholder
- `apps/mfr/app/accounting/page.tsx:6-16` — landing by role
- `apps/mfr/app/accounting/activity/page.tsx` — old activity address forwards to the admin activity log
- `apps/mfr/components/accounting/nav.tsx:15-67` — tab list, inbox count, locks
- `apps/mfr/app/accounting/unauthorized/page.tsx` — "Not authorized" message
- `apps/mfr/app/accounting/admin/layout.tsx:15` — admin gate for every admin page
- `e2e/tests/accounting.spec.ts` — landing and access smoke tests
- `apps/mfr/tests/accounting-integration/authz.test.ts` — access-level tests

## Change Log

- 2026-09-26 — Recovered from code.
