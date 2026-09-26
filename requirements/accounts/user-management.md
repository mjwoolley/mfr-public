---
id: CAP-005
title: User management
area: accounts
status: implemented
source: recovered
related: [CAP-002, CAP-003, CAP-004, CAP-009]
---

# User management

```gherkin
Feature: User management
  Owners and managers approve or block people; owners grant roles
  Capability: CAP-005

  Scenario Outline: Who can open user management
    Given I am an approved <role>
    When I open user management
    Then <outcome>

    Examples:
      | role                    | outcome                                    |
      | site owner              | I see the "User management" list           |
      | site manager            | I see the "User management" list           |
      | accounting manager      | I am taken back to the home page           |
      | member with no role     | I am taken back to the home page           |

  Scenario: Everyone who has ever signed in is listed
    Given I am a site owner or site manager
    When I open user management
    Then I see every account ordered by email address
    And each shows its name, email address and status of "pending", "approved" or "blocked"

  Scenario: Approving a pending person lets them in
    Given I am a site manager
    And "Ann" is waiting for approval
    When I choose "Approve" on Ann's row
    Then Ann's status shows "approved"
    And Ann can reach member pages on her next page load

  Scenario: Blocking a member locks them out
    Given I am a site manager
    And "Ann" is an approved member with no owner role
    When I choose "Block" on Ann's row
    Then Ann's status shows "blocked"
    And Ann is kept out of every section

  Scenario: The current status's button is unavailable
    Given "Ann" is approved
    Then the "Approve" button on Ann's row is unavailable
    But "Block" is available

  Scenario: I cannot change my own status
    Given I am a site owner or site manager
    When I try to approve or block my own account
    Then I am told "You can't change your own account status."
    And nothing changes

  Scenario: A site manager cannot change a site owner's status
    Given I am a site manager
    Then the "Approve" and "Block" buttons on a site owner's row are unavailable
    And if I try anyway I am told "Only the site owner can change another owner's status."

  Scenario: A site owner can change another owner's status
    Given I am a site owner
    When I block another site owner
    Then their status shows "blocked"

  Scenario: Only a site owner sees and changes roles
    Given I am a site owner
    When I choose "Site manager" on a member's row
    Then it shows "✓ Site manager"
    And choosing it again removes the role
    But a site manager sees no role buttons at all

  Scenario: An owner cannot give up their own owner role
    Given I am a site owner
    Then my own "✓ Site owner" button is unavailable
    And if I try anyway I am told "You can't remove your own site-owner role."

  Scenario: No accounts yet
    Given no one has signed in
    When I open user management
    Then I see "No users yet."
```

## Open Questions

- **[medium]** Approving, blocking and role changes are not recorded anywhere; the activity feed already knows how to word "approved" and "blocked" entries but nothing ever writes them. Should admin decisions on accounts appear in the site activity? (`apps/mfr/app/admin/users/actions.ts`, `apps/mfr/lib/reservations/activity/formatMessage.ts:44-48`)
- **[low]** The list is a single email-ordered list with no filter, so pending people are not surfaced first, and there is no way to return someone to pending or remove an account. Should pending accounts be pinned to the top? (`apps/mfr/lib/users.ts:22-43`)

## Related Features

- CAP-002 New sign-up handling — admins are alerted and sent here when someone waits
- CAP-003 Access for unapproved accounts — what the statuses set here mean for the person
- CAP-004 Admin roles — the roles granted here and who may grant them
- CAP-009 Site activity feed — approvals, blocks and role changes and the activity feed

## Code References

- `apps/mfr/app/admin/users/page.tsx` — page and intro "Approve or block family members. Only the site owner can assign roles."
- `apps/mfr/app/admin/users/UsersClient.tsx` — rows, buttons, disabled states, error banner, empty state
- `apps/mfr/app/admin/users/actions.ts` — status and role changes with self-lockout guards
- `apps/mfr/lib/users.ts:22-43` — list ordering
- `apps/mfr/tests/integration/userManagement.test.ts`, `e2e/tests/admin-edge.spec.ts:66-129`, `e2e/tests/web.spec.ts:67-98`

## Change Log

- 2026-09-26 — Recovered from code.
