---
id: CAP-046
title: Shareholder records
area: accounting
status: implemented
source: recovered
related: [CAP-002, CAP-033, CAP-034, CAP-035, CAP-040, CAP-047]
---

# Shareholder records

```gherkin
Feature: Shareholder records
  Admins add, edit and deactivate shareholder records (often households)
  Capability: CAP-046

  Background:
    Given I am signed in as an accounting admin
    And I am on the Shareholders view of the accounting Admin area

  Scenario: Admin adds a shareholder
    When I choose "Add shareholder"
    And I enter the name "John and Michele Anderegg" and the email "john@family.org"
    And I choose "Add shareholder"
    Then I am returned to the shareholder list
    And "John and Michele Anderegg" is listed with "john@family.org"
    And they can be chosen straight away when recording share transactions

  Scenario: A shareholder can be added without an email
    When I add a shareholder named "Ben Miller" with no email
    Then they are listed with "No email"

  Scenario: Several shareholders may have no email
    Given a shareholder with no email already exists
    When I add another shareholder with no email
    Then both are listed

  Scenario: Two shareholders may share a name
    Given a shareholder named "Ann Miller" exists
    When I add another shareholder named "Ann Miller"
    Then both are listed

  Scenario: A name is required
    When I try to add a shareholder with a blank name
    Then the shareholder is not added
    And, if the form's own checks are bypassed, I see "Name is required"

  Scenario: An email must be a valid address
    When I try to add a shareholder with the email "not-an-email"
    Then the shareholder is not added
    And, if the form's own checks are bypassed, I see "Enter a valid email"

  Scenario: Emails are stored in lower case
    When I add a shareholder with the email "Ann.Miller@Family.org"
    Then they are listed with "ann.miller@family.org"

  Scenario: Two shareholders can't have the same email
    Given a shareholder exists with the email "ann@family.org"
    When I try to add another shareholder with the email "ANN@family.org"
    Then I see "A shareholder with that email already exists"
    And the shareholder is not added

  Scenario: Admin edits a shareholder's name and email
    Given the shareholder "Ann Miller" exists
    When I choose "Edit" on her row
    And I change her name to "Ann Miller-Smith" and choose "Save"
    Then I stay on her Edit screen
    And the shareholder list shows "Ann Miller-Smith"

  Scenario: Editing can't take an email another shareholder already has
    Given shareholders "Ann Miller" with "ann@family.org" and "Bob Miller" exist
    When I edit "Bob Miller"'s email to "ann@family.org" and choose "Save"
    Then I see "A shareholder with that email already exists"
    And "Bob Miller"'s email is unchanged

  Scenario: The shareholder list
    Given several shareholders exist
    When I view the shareholder list
    Then they are listed alphabetically by name
    And each row shows the shareholder's email or "No email", the linked login or "Not linked", and an "Edit" link
    And I see "Shareholder records. A login links automatically when its email matches — otherwise open Edit to pick one."

  Scenario: The shareholder list fits a phone
    Given I am using a screen 390 pixels wide
    When I view the shareholder list
    Then it shows three columns and needs no sideways scrolling

  Scenario: No shareholders yet
    Given no shareholders exist
    When I view the shareholder list
    Then I see "No shareholders yet."

  Scenario: Admin deactivates a shareholder
    Given the shareholder "Ann Miller" is active
    When I open her Edit screen and clear "Active"
    Then the change is saved without any further step
    And the shareholder list shows her dimmed with "(inactive)"

  Scenario: Inactive shareholders can't take part in new share transactions
    Given "Ann Miller" is inactive
    When I record a share purchase, transfer or adjustment
    Then "Ann Miller" is not offered as a choice
    And if she is chosen anyway I see "Shareholder not found or inactive" and nothing is recorded

  Scenario: Inactive shareholders are left off the ownership figures
    Given "Ann Miller" is inactive
    When anyone views the ownership report
    Then "Ann Miller" is not listed

  Scenario: Admin reactivates a shareholder
    Given "Ann Miller" is inactive
    When I open her Edit screen and tick "Active"
    Then she is listed normally again
    And she can be chosen for new share transactions

  Scenario: A shareholder record can't be deleted
    When I open a shareholder's Edit screen
    Then I am offered no way to delete the record
    But I can deactivate it

  Scenario: Only accounting admins can change shareholder records
    Given I am signed in as a family member who is not an accounting admin
    When I try to add, edit or deactivate a shareholder without using the admin screens
    Then my change is refused and nothing is saved
```

## Open Questions

- **[high]** A shareholder who still holds shares can be deactivated with one click, with no warning or confirmation. They then drop off the ownership list while the total still counts their shares, so the listed percentages no longer add up to 100%. Their shares also can't be transferred out, because transfers need both shareholders to be active. Should deactivating a shareholder with a non-zero balance be blocked, or at least confirmed? (`apps/mfr/lib/accounting/ledger.ts:49-77`; `apps/mfr/actions/accounting/transfers.ts:63`; `apps/mfr/app/accounting/admin/shareholders/[id]/edit/edit-shareholder-form.tsx:55-69`)
- **[medium]** Deactivation doesn't affect the member's login. An inactive shareholder's linked login still reaches the personal dashboard, and a new sign-up whose email matches an inactive shareholder is still linked and approved automatically. Should deactivation also remove personal access? (`apps/mfr/lib/auth.ts:43-84`; `apps/mfr/lib/portal/signup.ts:104-118`)
- **[low]** If saving the "Active" checkbox fails, the box stays changed on screen and no error is shown. (`apps/mfr/app/accounting/admin/shareholders/[id]/edit/edit-shareholder-form.tsx:60-66`)

## Related Features

- CAP-002 New sign-up handling — a new sign-up whose email is on a shareholder record is let straight in
- CAP-034 Share transfers — inactive shareholders can't send or receive shares
- CAP-040 Ownership report — lists active shareholders only
- CAP-047 Link logins to shareholders — linking a record to a person's login, including automatically from its email
- CAP-033 Record a share purchase — inactive shareholders can't receive share purchases
- CAP-035 Balance adjustments — inactive shareholders can't receive adjustments

## Code References

- `apps/mfr/actions/accounting/shareholders.ts:32-175` — create, update, activate/deactivate, validation messages
- `apps/mfr/app/accounting/admin/shareholders/page.tsx` — list, ordering, "(inactive)", empty state
- `apps/mfr/app/accounting/admin/shareholders/new/` — add form and copy
- `apps/mfr/app/accounting/admin/shareholders/[id]/edit/edit-shareholder-form.tsx` — edit form and Active checkbox
- `apps/mfr/lib/accounting/ledger.ts:49-77` — balances use active shareholders only
- `apps/mfr/actions/accounting/contributions.ts:67`, `adjustments.ts:51`, `transfers.ts:63` — inactive shareholders refused
- `apps/mfr/app/accounting/admin/transactions/page.tsx:30` — entry forms offer active shareholders only
- `apps/mfr/lib/db/schema/accounting.ts:50-75` — Shareholder record, unique email and login
- `e2e/tests/shareholder-linking.spec.ts:156-174`; `apps/mfr/tests/accounting-integration/shareholders.test.ts:78-170, 277-292, 503-560` — tests

## Change Log

- 2026-09-26 — Recovered from code.
