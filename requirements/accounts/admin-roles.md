---
id: CAP-004
title: Admin roles
area: accounts
status: implemented
source: recovered
related:
  [
    CAP-002,
    CAP-003,
    CAP-005,
    CAP-007,
    CAP-008,
    CAP-009,
    CAP-013,
    CAP-015,
    CAP-016,
    CAP-017,
    CAP-025,
    CAP-026,
    CAP-027,
    CAP-030,
    CAP-043,
  ]
---

# Admin roles

```gherkin
Feature: Admin roles
  Site owner, site manager and accounting manager decide who can administer what (owns the role table)
  Capability: CAP-004

  Scenario Outline: What each role may administer
    Given I am an approved member holding only the <role> role
    Then I <assign> assign roles to people
    And I <approve> approve or block members
    And I <content> edit site settings, events and other members' photos
    And I <reservations> administer reservations, blocked dates and booking rules
    And I <accounting> administer the accounting books

    Examples:
      | role               | assign  | approve | content | reservations | accounting |
      | site owner         | can     | can     | can     | can          | can        |
      | site manager       | cannot  | can     | can     | can          | cannot     |
      | accounting manager | cannot  | cannot  | cannot  | cannot       | can        |
      | no role            | cannot  | cannot  | cannot  | cannot       | cannot     |

  Scenario: Roles stack
    Given I hold both the site manager and accounting manager roles
    Then I can administer reservations, site content and the accounting books
    But I still cannot assign roles

  Scenario: A new account holds no roles
    When someone signs up for the first time
    Then they hold none of the three roles until a site owner grants one

  Scenario: Roles only count once the account is approved
    Given I hold the site manager role
    But my account is pending or blocked
    When I open the admin area
    Then I am kept out like any other unapproved account

  Scenario: The designated owner email is always a site owner
    Given I sign in with the designated site-owner email
    Then I have every site-owner power even if no one has granted me the role

  Scenario: Role changes take effect on my next page
    Given a site owner grants me the site manager role
    When I open or reload any page
    Then I have the site manager's powers without signing in again
```

## Open Questions

- **[medium]** The designated site-owner email defaults to one person's personal address in code when no setting overrides it, and that account can never be blocked or lose owner powers from the user management screen. Is a permanent code-level owner the intended policy for production? (`packages/auth/src/config.ts:145-156`)
- **[medium]** A site manager can block other site managers and accounting managers; only owners are protected. Should managers be able to lock out fellow admins? (`apps/mfr/app/admin/users/actions.ts:42-54`)

## Related Features

- CAP-005 User management — where roles are granted and members approved
- CAP-007 Site navigation — the Admin tab appears only for site owners and managers
- CAP-008 Site settings — site content editing is a site owner or manager power
- CAP-009 Site activity feed — visible to site owners and managers
- CAP-015 Photo details — content admins may fix any member's photo
- CAP-016 Delete photos — content admins may delete any member's photo
- CAP-017 Featured photos — content admin powers over featured photos
- CAP-025 Manage all reservations — reservations admin power
- CAP-026 Blocked dates — reservations admin power
- CAP-027 Booking rules settings — reservations admin power
- CAP-030 Accounting access and tabs — accounting admin power
- CAP-013 Photo albums — content admins can manage every photo in the albums
- CAP-043 Accounting activity log — only accounting admins see the activity log
- CAP-003 Access for unapproved accounts — roles only count once an account is approved
- CAP-002 New sign-up handling — sign-up alerts go to everyone holding an admin role

## Code References

- `packages/auth/src/roles.ts:15-46` — the role model and each capability
- `apps/mfr/lib/db/schema/portal.ts:23-29` — one roles record per user; none means no roles
- `packages/auth/src/config.ts:141-159` — roles attached to every session; designated owner email
- `apps/mfr/lib/authz.ts`, `apps/mfr/lib/accounting/authz.ts:48-55`, `apps/mfr/lib/reservations/auth/requireReservationsAdmin.ts` — per-section admin checks
- `packages/auth/src/roles.test.ts`

## Change Log

- 2026-09-26 — Recovered from code.
