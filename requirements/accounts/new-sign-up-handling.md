---
id: CAP-002
title: New sign-up handling
area: accounts
status: implemented
source: recovered
related: [CAP-001, CAP-003, CAP-004, CAP-005, CAP-009, CAP-010, CAP-046, CAP-047]
---

# New sign-up handling

```gherkin
Feature: New sign-up handling
  A shareholder email gets straight in; anyone else waits and admins are alerted
  Capability: CAP-002

  Scenario: A shareholder's email is approved and linked on first sign-in
    Given a shareholder record carries the email "ann@example.com"
    And no one has signed in with that email before
    When I sign in with Google for the first time as "ann@example.com"
    Then my account is approved straight away
    And my login is linked to that shareholder record
    And the admins are not alerted

  Scenario: The shareholder email match ignores capitalization
    Given a shareholder record carries the email "ann@example.com"
    When I sign in for the first time as "Ann@Example.com"
    Then my account is approved and linked to that shareholder record

  Scenario: No approval without a successful link
    Given a shareholder record carries my email
    But that record is already linked to another login
    When I sign in with Google for the first time
    Then my account stays awaiting approval

  Scenario: Anyone else waits for approval and the admins are alerted
    Given no shareholder record carries my email
    When I sign in with Google for the first time
    Then my account is awaiting approval
    And every approved site owner, site manager and accounting manager is emailed
    And the alert also goes to the signup text-message number

  Scenario: The alert gets an admin to the approval screen in one tap
    Given "Ann Miller" has just signed up and waits for approval
    When the admins receive the alert
    Then its subject is "New signup: Ann Miller"
    And it links straight to user management before any other text
    And it says "No shareholder record matched their email, so they are waiting for an admin to approve them."
    And it reminds admins to link them to a shareholder record from Accounting if they should be tied to one

  Scenario: A sign-up with no Google name is announced by email address
    Given Google supplied no name for me
    When I sign up and no shareholder record carries my email
    Then the alert subject names me by my email address

  Scenario: The text-message alert can be turned off
    Given the signup text-message number has been set to blank
    When someone signs up without a shareholder match
    Then only the admins are emailed

  Scenario: Nobody to alert is not an error
    Given no one holds an admin role and the text-message number is blank
    When someone signs up without a shareholder match
    Then no alert is sent
    And their sign-in still completes normally

  Scenario: A problem during sign-up handling never breaks sign-in
    Given the shareholder lookup or the alert fails
    When I sign in with Google for the first time
    Then I am still signed in
    And my account is awaiting approval

  Scenario: Every sign-up is recorded in the site activity
    When I sign in with Google for the first time
    Then the site activity shows that I signed up
    And if I was approved by email match it also shows I "signed up and was approved automatically"
```

## Open Questions

- **[high]** A new sign-up whose email matches a shareholder record that an admin has already linked by hand to someone else (e.g. a spouse) takes that record over and is approved automatically; the spouse silently loses access. The code comment says a uniqueness rule prevents this, but that rule only stops one login holding two records. Same policy question as CAP-047's household link. (`apps/mfr/lib/portal/signup.ts:110-120`, `apps/mfr/lib/portal/signup.test.ts:131-136`)
- **[medium]** Auto-approval happens only on the first-ever sign-in. If an admin later puts a pending person's email on a shareholder record, the account gets linked but stays pending until someone approves it. Should a later email match approve them too? (`apps/mfr/lib/portal/signup.ts:98-124`, `apps/mfr/lib/auth.ts:43-84`)
- **[medium]** Alerts go to accounting managers, who cannot approve anyone. The code comment claims only site owners can approve, but site managers can too. Also, the text-message number is a personal phone hard-coded as the default. Who should receive signup alerts, and should that number live in configuration instead of code? (`apps/mfr/lib/portal/signup.ts:35-63`)

## Related Features

- CAP-001 Sign in with Google — the first sign-in is what triggers this handling
- CAP-003 Access for unapproved accounts — what a waiting person can and cannot see
- CAP-005 User management — where the alerted admins approve the person
- CAP-009 Site activity feed — sign-up and auto-approval entries appear there
- CAP-010 Email safety outside production — the alert follows the non-production email rule
- CAP-046 Shareholder records — the email on a shareholder record is what triggers auto-approval
- CAP-047 Link logins to shareholders — later linking and session-time relinking by email
- CAP-004 Admin roles — sign-up alerts go to everyone holding an admin role

## Code References

- `apps/mfr/lib/portal/signup.ts` — match, link, approve, notify; SMS default and override
- `apps/mfr/lib/auth.ts:33-42` — sign-up activity entry and hand-off to signup handling
- `apps/mfr/emails/portal/NewSignupNotification.tsx` — alert email
- `apps/mfr/lib/reservations/activity/formatMessage.ts:38-42` — sign-up activity wording
- `apps/mfr/lib/portal/signup.test.ts`, `apps/mfr/emails/portal/templates.test.ts`

## Change Log

- 2026-09-26 — Recovered from code.
