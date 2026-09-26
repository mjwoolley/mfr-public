---
id: CAP-001
title: Sign in with Google
area: accounts
status: implemented
source: recovered
related: [CAP-002, CAP-003]
---

# Sign in with Google

```gherkin
Feature: Sign in with Google
  One Google sign-in recognizes a member everywhere and returns them where they were going
  Capability: CAP-001

  Scenario: Google is the only way to sign in
    Given I am not signed in
    When I open the sign-in page
    Then I see "Sign in to access the family portal."
    And I am offered a single "Sign in with Google" button
    And I am told "You must have a Google account to sign in to this website."

  Scenario: Help for people without a Google account
    Given I am not signed in
    When I open the sign-in page
    Then I am offered a link to register for a Google account
    And I am shown how to choose "Use your existing email" so I can register with the address I already have

  Scenario: One sign-in covers every section
    Given I have signed in with Google
    When I visit Meals, Reservations and Accounting in turn
    Then I am recognized in each section without signing in again

  Scenario: Signing out ends my session in every section
    Given I am signed in
    When I choose "Sign out"
    Then I am taken to the home page as a signed-out visitor
    And Reservations and Accounting both ask me to sign in again

  Scenario Outline: A signed-out visit to a section returns me there after sign-in
    Given I am not signed in
    When I open <section>
    Then I am asked to sign in
    And after signing in with Google I land back in <section>

    Examples:
      | section      |
      | Reservations |
      | Accounting   |

  Scenario Outline: A signed-out visit to a portal page lands on the home page after sign-in
    Given I am not signed in
    When I open <page>
    Then I am asked to sign in
    And after signing in with Google I land on the home page

    Examples:
      | page      |
      | Meals     |
      | Photos    |
      | Documents |

  Scenario: Opening the sign-in page while signed in skips it
    Given I am already signed in
    When I open the sign-in page
    Then I am taken straight to the home page

  Scenario: After sign-in I am only returned to a page on this site
    Given I started signing in from a link that points to another website
    When I finish signing in with Google
    Then I land on the home page of this site instead

  Scenario Outline: A failed sign-in explains what went wrong
    Given my Google sign-in failed because <reason>
    When I am returned to the sign-in page
    Then I see "<message>"
    And I see the error code so I can report it
    And I can try "Sign in with Google" again

    Examples:
      | reason                                         | message                                                                                                                                                              |
      | my email is registered under another sign-in   | This email address is already registered here. Try signing in again with the same Google account you used before; if this keeps happening, contact the site owner. |
      | I cancelled or was not allowed                 | Sign-in was cancelled or not allowed. Please try again.                                                                                                              |
      | the site is misconfigured                      | Something is wrong on our end and sign-in cannot complete right now. Please contact the site owner.                                                                  |
      | talking to Google failed                       | Something went wrong while talking to Google. Please try again.                                                                                                      |
      | my sign-in link had expired                    | That sign-in link is no longer valid. Please sign in again.                                                                                                          |
      | of an error the site does not recognize        | Something went wrong while signing you in. Please try again; if it keeps happening, contact the site owner.                                                         |
```

## Open Questions

- **[high]** When I am already signed in, the sign-in page sends me to whatever address is in its return link without checking it, so a crafted link can bounce a signed-in member to an outside website (an open redirect). The unit test asserts a redirect to an absolute other-domain address, left over from when the sections lived on separate subdomains. Should an already-signed-in visitor be held to the same "this site only" rule as the post-sign-in return? (`apps/mfr/app/sign-in/page.tsx:31-34`, `apps/mfr/app/sign-in/page.test.tsx:101-107`)
- **[low]** Meals, Photos and Documents send signed-out visitors to sign in without remembering the page, so a shared link to a document lands the member on Home afterwards; Reservations and Accounting do remember. Should portal pages return people where they were going? (`apps/mfr/lib/authz.ts:14-18`)

## Related Features

- CAP-002 New sign-up handling — a first-ever sign-in creates the account and decides whether it is approved
- CAP-003 Access for unapproved accounts — what a signed-in but pending or blocked person can reach

## Code References

- `apps/mfr/app/sign-in/page.tsx` — sign-in page, help text, error messages, already-signed-in redirect
- `apps/mfr/lib/auth.ts:23-31` — the single Auth.js instance; sign-in page doubles as the error page
- `packages/auth/src/config.ts:87-140` — Google-only provider, database sessions, email account linking, return-link validation
- `apps/mfr/app/layout.tsx:40-58`, `packages/ui/src/AuthStatus.tsx` — header email and "Sign out"
- `apps/mfr/lib/authz.ts:14-18`, `apps/mfr/lib/reservations/auth/portalStatusGate.ts`, `apps/mfr/lib/accounting/authz.ts:7` — sign-in redirects per section
- `e2e/tests/web.spec.ts:51-65`, `e2e/tests/auth-cross-app.spec.ts:10-50`

## Change Log

- 2026-09-26 — Recovered from code.
