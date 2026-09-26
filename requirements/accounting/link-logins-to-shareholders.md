---
id: CAP-047
title: Link logins to shareholders
area: accounting
status: implemented
source: recovered
related: [CAP-002, CAP-030, CAP-031, CAP-046]
---

# Link logins to shareholders

```gherkin
Feature: Link logins to shareholders
  The right person, including a spouse, reaches the right balance
  Capability: CAP-047

  # Linking at a person's very first sign-in (and approving them) belongs to CAP-002.
  # This feature covers admin linking and the matching done on every later visit.

  Scenario: A login whose email is on a shareholder record reaches that shareholder
    Given the shareholder "Ann Miller" has the email "ann@family.org"
    When I sign in with the Google account "Ann@Family.org"
    Then I get Ann Miller's personal accounting views
    And my login is shown as linked to "Ann Miller" on the shareholder list

  Scenario: A spouse linked by hand reaches the household's balance
    Given the shareholder "John and Michele Anderegg" has John's email
    And an admin has linked Michele's login to that shareholder
    When Michele signs in
    Then she reaches the dashboard for "John and Michele Anderegg"

  Scenario: An email match takes priority over a link made by hand
    Given an admin linked my login to the shareholder "Ann Miller"
    And a different shareholder "Ann and Bob Miller" has my email address
    When I sign in
    Then I get the personal views for "Ann and Bob Miller"

  Scenario: A login with no email match and no link has no personal views
    Given no shareholder has my email and no admin has linked my login
    When I sign in
    Then I am not given any shareholder's personal views

  Scenario: Adding a shareholder with an existing login's email links it straight away
    Given I am signed in as an accounting admin
    And a family member already signs in as "ann@family.org"
    When I add a shareholder with the email "ANN@family.org"
    Then the shareholder list shows that shareholder linked to Ann's login

  Scenario: Changing a shareholder's email to an existing login's email links it
    Given I am signed in as an accounting admin
    And a family member already signs in as "bob@family.org"
    When I change an unlinked shareholder's email to "bob@family.org"
    Then that shareholder is linked to Bob's login

  Scenario: Editing a shareholder keeps a link made by hand
    Given I am signed in as an accounting admin
    And I linked a shareholder to a login by hand
    When I change the shareholder's name, or change the email to one no login uses
    Then the shareholder stays linked to the same login

  Scenario: A login can belong to only one shareholder
    Given I am signed in as an accounting admin
    And the login "ann@family.org" is linked by hand to the shareholder "Ann Miller", whose own email is "ann.miller@oldmail.org"
    When I add another shareholder, or edit one, giving it the email "ann@family.org"
    Then I see "That login is already linked to a different shareholder"
    And nothing is changed

  Scenario: Only approved, unlinked logins are offered for linking
    Given I am signed in as an accounting admin
    And I am on an unlinked shareholder's Edit screen
    When I open "Link a login"
    Then I see each approved login that isn't linked to any shareholder, as "Name — email"
    But pending or blocked logins, and logins already linked elsewhere, are not offered

  Scenario: Nobody left to link
    Given I am signed in as an accounting admin
    And every approved login is already linked to a shareholder
    When I open an unlinked shareholder's Edit screen
    Then I see "Not linked. Every approved login is already linked to another shareholder."

  Scenario Outline: Logins whose name fits the shareholder's name are suggested first
    Given I am signed in as an accounting admin
    And I am on the Edit screen of the shareholder "<shareholder>"
    When I open "Link a login"
    Then the login named "<login>" is <placement>

    Examples:
      | shareholder               | login              | placement                                  |
      | John and Michele Anderegg | Michele Anderegg   | under "Suggested — name matches"           |
      | Michele Anderegg          | Michele A Anderegg | under "Suggested — name matches"           |
      | Mary-Jo O'Brien           | Mary Jo OBrien     | under "Suggested — name matches"           |
      | José Miller               | Jose Miller        | under "Suggested — name matches"           |
      | Anderegg Miller           | Ann Miller         | not suggested                              |
      | Ann Miller                | Ann and Bob Miller | not suggested                              |

  Scenario: The rest of the logins are grouped separately
    Given I am signed in as an accounting admin
    When I open "Link a login" on a shareholder's Edit screen
    Then logins that aren't suggested appear under "Everyone else"
    But when nothing is suggested they appear under "No name matches"

  Scenario: A suggested login with a matching email links in one step
    Given I am signed in as an accounting admin
    And the login I pick is suggested and has the same email as the shareholder
    When I choose "Link"
    Then the shareholder shows "Linked to" that login's name and email

  Scenario: Linking a login whose name doesn't fit needs confirmation
    Given I am signed in as an accounting admin
    And I pick the login "Outsider Person" for the shareholder "The Carter Household"
    When I choose "Link"
    Then I see "Outsider Person doesn't appear in The Carter Household. Link them anyway?"
    And I see "Linking gives this login access to The Carter Household's share balance and approvals."
    And I can choose "Link anyway" or "Back"

  Scenario: Backing out of a confirmation links nobody
    Given I am signed in as an accounting admin
    And I am being asked to confirm a link
    When I choose "Back"
    Then the shareholder is still "Not linked"

  Scenario: Linking a shareholder with no email fills in the login's email
    Given I am signed in as an accounting admin
    And the shareholder "The Davis Household" has no email
    When I link a suggested login whose email is "visitor@family.org"
    Then I am not asked about the email
    And the shareholder now has the email "visitor@family.org"

  Scenario: A differing email is kept or replaced by choice
    Given I am signed in as an accounting admin
    And the shareholder "John and Michele Anderegg" has the email "john@family.org"
    When I pick Michele's login, "michele@family.org", and choose "Link"
    Then I see "This login's email differs from the shareholder's:"
    And I am offered "Link, keep john@family.org" and "Link and use michele@family.org"

  Scenario Outline: What happens to the shareholder's email after linking
    Given I am signed in as an accounting admin
    And I am being asked about the differing emails "john@family.org" and "michele@family.org"
    When I choose "<choice>"
    Then the shareholder is linked to Michele's login
    And the shareholder's email is "<email>"

    Examples:
      | choice                              | email              |
      | Link, keep john@family.org          | john@family.org    |
      | Link and use michele@family.org     | michele@family.org |

  Scenario: The part of the email that differs is highlighted
    Given I am signed in as an accounting admin
    And the shareholder's email is "melanmiller20@gmail.com" and the login's is "melanimiller20@gmail.com"
    When I am asked about the differing emails
    Then both addresses are shown one above the other with only the "i" in the login's address highlighted
    And I see "Only the highlighted part differs — the shareholder’s is missing it."

  Scenario: Linking can't take an email another shareholder already uses
    Given I am signed in as an accounting admin
    And the shareholder "Bob Miller" already has the email "michele@family.org"
    When I link Michele's login to a shareholder with no email, or choose to use her email
    Then I see "\"Bob Miller\" already uses michele@family.org. Clear it there first, then link."
    And nothing is linked or changed

  Scenario: Admin unlinks a login
    Given I am signed in as an accounting admin
    And the shareholder is "Linked to Michele Anderegg — michele@family.org"
    When I choose "Unlink"
    Then the shareholder shows "Not linked"
    And Michele's login is offered again for linking

  Scenario: An unlinked login whose email doesn't match loses the personal views
    Given an admin has unlinked Michele's login from "John and Michele Anderegg"
    And no shareholder has Michele's email
    When Michele next visits the accounting pages
    Then she no longer gets that shareholder's personal views

  Scenario: Only accounting admins can link or unlink
    Given I am signed in as a family member who is not an accounting admin
    When I try to link or unlink a login without using the admin screens
    Then my change is refused and nothing is saved
```

## Open Questions

- **[high]** A household's link made by hand can be taken over. If "John and Michele Anderegg" carries John's email and an admin linked Michele's login, John's next sign-in (or first sign-up) re-points the record to John. Michele then loses the household dashboard with no warning to anyone. A code comment in the sign-up handler says the database prevents this; it doesn't. Should a record carrying one spouse's email be able to keep the other spouse linked, and should an existing link ever be replaced automatically? (`apps/mfr/lib/auth.ts:65-70`; `apps/mfr/lib/portal/signup.ts:111-116`)
- **[high]** "Unlink" doesn't hold when the login's email matches the shareholder's email: the next visit links it straight back. The only way to remove that person's access is to change the shareholder's email. Unlink also asks for no confirmation. Should unlinking stick, and should it be confirmed? (`apps/mfr/actions/accounting/shareholders.ts:257-262` vs `apps/mfr/lib/auth.ts:47-70`; `apps/mfr/app/accounting/admin/shareholders/[id]/edit/link-login-control.tsx:124-129`)
- **[medium]** The email match on each visit links logins silently: no activity entry records when or why it happened (docs/backlog.md item 1 already notes this). Separately, the server accepts any login for linking and doesn't itself check that the login exists and is approved; only the picker filters them. (`apps/mfr/lib/auth.ts:43-84`; `apps/mfr/actions/accounting/shareholders.ts:204-221`)

## Related Features

- CAP-002 New sign-up handling — links and approves a brand-new sign-up whose email is on a shareholder record
- CAP-030 Accounting access and tabs — a linked login is what unlocks the personal views
- CAP-031 Shareholder dashboard — what a correctly linked person reaches
- CAP-046 Shareholder records — the records being linked; adding or editing their email can link a login

## Code References

- `apps/mfr/lib/auth.ts:43-84` — matching on every visit: email first, then a link made by hand
- `apps/mfr/actions/accounting/shareholders.ts:18-30, 78-99, 141-164` — linking on create/edit by email
- `apps/mfr/actions/accounting/shareholders.ts:177-262` — link (with email rule) and unlink
- `apps/mfr/app/accounting/admin/shareholders/[id]/edit/link-login-control.tsx` — picker, confirmations, messages
- `apps/mfr/lib/accounting/linkCandidates.ts` — approved, unlinked logins only
- `apps/mfr/lib/accounting/nameMatch.ts` — name-suggestion rule
- `apps/mfr/lib/accounting/emailDiff.ts` — highlighting the differing part
- `e2e/tests/shareholder-linking.spec.ts`; `apps/mfr/tests/accounting-integration/shareholders.test.ts:172-500`; `apps/mfr/lib/accounting/authExtendSession.test.ts` — tests

## Change Log

- 2026-09-26 — Recovered from code.
