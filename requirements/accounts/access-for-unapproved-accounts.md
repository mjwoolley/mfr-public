---
id: CAP-003
title: Access for unapproved accounts
area: accounts
status: implemented
source: recovered
related: [CAP-001, CAP-002, CAP-004, CAP-005, CAP-006, CAP-011, CAP-012, CAP-013, CAP-022, CAP-030]
---

# Access for unapproved accounts

```gherkin
Feature: Access for unapproved accounts
  Pending and blocked people are kept out of member content (owns the approval gate for every section)
  Capability: CAP-003

  Scenario Outline: Only approved accounts reach member pages
    Given I am signed in and my account is <status>
    When I open <page>
    Then <outcome>

    Examples:
      | status   | page         | outcome                                          |
      | approved | Meals        | I see the Meals page                             |
      | pending  | Meals        | I am taken back to the home page                 |
      | blocked  | Meals        | I am taken back to the home page                 |
      | pending  | Documents    | I am taken back to the home page                 |
      | pending  | Photos       | I am taken back to the home page                 |
      | pending  | Admin        | I am taken back to the home page                 |
      | pending  | Reservations | I see that my account is awaiting approval       |
      | blocked  | Reservations | I see that my account does not currently have access |
      | pending  | Accounting   | I see that my account is awaiting approval       |
      | blocked  | Accounting   | I see that my account does not currently have access |

  Scenario: Reservations explains a pending account
    Given I am signed in and my account is awaiting approval
    When I open Reservations
    Then I see "Your access is pending approval"
    And I see "An admin needs to approve your account before you can view or book the cabin calendar."
    And I am offered "Check again"

  Scenario: Accounting explains a pending account
    Given I am signed in and my account is awaiting approval
    When I open Accounting
    Then I see "Your access is pending approval"
    And I see "An admin needs to approve your account before you can use the family portal."
    And I am offered "Check again"

  Scenario: Approval takes effect without signing out
    Given I am waiting on the Reservations pending screen
    And an admin approves my account
    When I choose "Check again" or reload the page
    Then I am taken into Reservations

  Scenario: A blocked account is told to contact an admin
    Given I am signed in and my account is blocked
    When I open Reservations or Accounting
    Then I see "Access unavailable"
    And I am told to contact the site admin if I believe this is a mistake

  Scenario: Blocking takes effect immediately
    Given I am signed in and using the site
    When an admin blocks my account
    Then the next page I open in any section keeps me out

  Scenario: Unapproved accounts cannot act behind the screens
    Given I am signed in and my account is pending or blocked
    When I try to book, change a reservation, record meals, upload photos or download a document without using the member screens
    Then my request is refused and nothing is saved or sent

  Scenario: The site owner's own account is always approved
    # Breaks the catch-22 on a fresh copy of the site where no one could approve the owner.
    Given I sign in with the designated site-owner email
    When my account is pending or blocked
    Then I am treated as an approved site owner anyway
```

## Open Questions

- **[high]** Both pending screens promise "You'll be notified by email once you're approved.", but no email is sent when an admin approves someone. Should an approval email be added, or the promise removed? (`apps/mfr/app/reservations/(public)/pending/page.tsx`, `apps/mfr/app/accounting/pending/page.tsx`, `apps/mfr/app/admin/users/actions.ts:31-59`)
- **[medium]** On Meals, Documents, Photos and Admin, a pending or blocked person is silently sent back to Home with no explanation, while Reservations and Accounting show a proper pending or blocked screen. Should the portal pages explain too? (`apps/mfr/lib/authz.ts:14-18`)

## Related Features

- CAP-001 Sign in with Google — signing in comes before the approval check
- CAP-002 New sign-up handling — decides whether a new account starts approved or pending
- CAP-005 User management — where admins approve and block accounts
- CAP-006 Home page — the one page pending and blocked people still see
- CAP-011 Meal RSVPs — gated by this rule
- CAP-012 Family documents — gated by this rule
- CAP-013 Photo albums — gated by this rule
- CAP-022 Cabin calendar — gated by this rule, with its own pending and blocked screens
- CAP-030 Accounting access and tabs — builds its shareholder rules on top of this gate
- CAP-004 Admin roles — roles only count once an account is approved

## Code References

- `packages/auth/src/portalStatusGate.ts` — the shared status gate
- `apps/mfr/lib/authz.ts` — portal gate (pending and blocked go to Home)
- `apps/mfr/lib/reservations/auth/portalStatusGate.ts`, `apps/mfr/lib/reservations/auth/requireApprovedUser.ts` — reservations gate and behind-the-screens refusal
- `apps/mfr/lib/accounting/authz.ts:1-45` — accounting gate
- `apps/mfr/app/reservations/(public)/pending/page.tsx`, `apps/mfr/app/reservations/(public)/blocked/page.tsx`, `apps/mfr/app/accounting/pending/page.tsx`, `apps/mfr/app/accounting/blocked/page.tsx`
- `packages/auth/src/config.ts:145-156` — designated site-owner email
- `e2e/tests/auth-cross-app.spec.ts:52-67`, `e2e/tests/admin-edge.spec.ts:67-103`

## Change Log

- 2026-09-26 — Recovered from code.
