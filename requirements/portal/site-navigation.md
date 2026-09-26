---
id: CAP-007
title: Site navigation
area: portal
status: implemented
source: recovered
related: [CAP-004, CAP-006]
---

# Site navigation

```gherkin
Feature: Site navigation
  Section tabs, Family Chat, sign in/out, and the Admin tab only for admins
  Capability: CAP-007

  Scenario: Every visitor sees the section tabs
    When I open any page
    Then I see tabs for "Home", "Reservations", "Accounting", "Photos", "Meals" and "Documents"
    And the tab for the section I am in is highlighted

  Scenario: Family Chat opens the family's chat space separately
    Given an admin has set the Family Chat link
    When I choose "Family Chat"
    Then the family chat space opens in a new tab

  Scenario: Family Chat falls back to Google Chat
    Given no Family Chat link has been set
    When I choose "Family Chat"
    Then Google Chat opens in a new tab

  Scenario Outline: The Admin tab shows only for site admins
    Given I am signed in as a <role>
    When I open any page
    Then the "Admin" tab is <visibility>

    Examples:
      | role                | visibility |
      | site owner          | shown      |
      | site manager        | shown      |
      | accounting manager  | not shown  |
      | member with no role | not shown  |

  Scenario: The header shows who I am signed in as
    Given I am signed in
    When I open any page
    Then I see my email address and "Sign out" in the header

  Scenario: Signed-out visitors get a sign-in link
    Given I am not signed in
    When I open any page
    Then I see "Sign in" in the header

  Scenario: On a phone the tabs fold into a menu
    Given I am on a phone-sized screen
    When I open any page
    Then the tabs are hidden behind a "Menu" button
    And choosing "Menu" shows them
    And choosing a tab takes me there and closes the menu
```

## Open Questions

- **[low]** The Family Chat link is shown to signed-out visitors as well, so the family's chat space address is public. Is that acceptable, or should it be members-only? (`apps/mfr/app/PortalNav.tsx:97-106`)

## Related Features

- CAP-004 Admin roles — which roles get the Admin tab
- CAP-006 Home page — the "Home" tab and the header's sign-in link lead there

## Code References

- `apps/mfr/app/PortalNav.tsx` — tabs, Family Chat, Admin tab
- `apps/mfr/app/layout.tsx:31-59` — header sign-in/out, admin check, chat link fallback
- `packages/ui/src/ResponsiveNav.tsx`, `packages/ui/src/AuthStatus.tsx`
- `e2e/tests/web.spec.ts:10-49`

## Change Log

- 2026-09-26 — Recovered from code.
