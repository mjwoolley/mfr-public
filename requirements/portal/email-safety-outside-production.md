---
id: CAP-010
title: Email safety outside production
area: portal
status: implemented
source: recovered
related: [CAP-002, CAP-029, CAP-039]
---

# Email safety outside production

```gherkin
Feature: Email safety outside production
  No real family member is ever emailed from a test or preview (owns this rule for all email)
  Capability: CAP-010

  # Test and preview copies of the site hold real family email addresses copied
  # from the live site, so this rule protects every email the site sends:
  # signup alerts, reservation emails and ledger notifications.

  Scenario: The live site emails real recipients
    Given I am using the live site, the only copy with sending switched on
    When the site sends an email to a family member with admins copied
    Then the family member and the copied admins receive it as written

  Scenario: A test copy redirects every email to the testing inbox
    Given I am using a test or preview copy of the site
    And a testing inbox has been set
    When the site sends an email to "dbrown@gmail.com"
    Then the email arrives in the testing inbox instead
    And its subject starts with "[dev→dbrown@gmail.com]"
    And dbrown@gmail.com receives nothing

  Scenario: Redirected emails keep each original recipient distinguishable
    Given I am using a test copy whose testing inbox is "tester@gmail.com"
    When the site sends an email to "dbrown@gmail.com"
    Then it is delivered to "tester+dbrown=gmail.com@gmail.com"

  Scenario: Copied admins are redirected too
    Given I am using a test copy with a testing inbox set
    When the site sends an email with admins copied
    Then each copied admin's address is also redirected to the testing inbox
    And no admin receives it directly

  Scenario: The signup text-message alert is redirected like any email
    Given I am using a test copy with a testing inbox set
    When someone signs up without a shareholder match
    Then the text-message alert lands in the testing inbox and no phone receives it

  Scenario: With no testing inbox, email is dropped
    Given I am using a test or preview copy of the site
    And no testing inbox has been set
    When the site would send an email
    Then nobody receives it
    And the skipped email is noted in the site's logs

  Scenario: A failed send never breaks what I was doing
    Given the email service fails
    When I do something that sends an email, such as booking a stay
    Then my action still completes
    And the failure is only noted in the site's logs
```

## Open Questions

- **[medium]** Email failures are only written to the logs, never shown or alerted, and no test ever performs a real send, so an email outage would go unnoticed until a family member says "I never got that" (backlog: "Email can stop working and nothing would notice"). Should failed sends be surfaced or monitored? (`apps/mfr/lib/reservations/email.ts:136-138`, `apps/mfr/lib/accounting/email.ts:119-121`, `docs/backlog.md:148-204`)

## Related Features

- CAP-002 New sign-up handling — the signup alert email and text message follow this rule
- CAP-029 Reservation emails — confirmation, change and cancel emails follow this rule
- CAP-039 Ledger email notifications — ledger emails follow this rule

## Code References

- `apps/mfr/lib/reservations/email.ts:43-139` — recipient decision, plus-addressing, copied-admin redirect, subject prefix, swallowed failures (used by signup and reservations emails)
- `apps/mfr/lib/accounting/email.ts:40-122` — the same rule for ledger emails (no copied recipients)
- `docs/workflow.md:141-144,169-171`, `docs/preview-deploys.md:99` — only the live site switches sending on

## Change Log

- 2026-09-26 — Recovered from code.
