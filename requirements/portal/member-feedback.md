---
id: CAP-048
title: Member Feedback
area: portal
status: proposed
source: specified
related: [CAP-003, CAP-004, CAP-010]
---

# Member Feedback

```gherkin
Feature: Member Feedback
  Approved members can send free-text Feedback without leaving their current page
  Capability: CAP-048

  Background:
    Given Jira project "KAN" is configured to receive Feedback as Task issues
    And Feedback issues carry the label "mfr-feedback"

  Scenario Outline: Only approved members see the Feedback button
    Given my portal status is <status>
    When I open a portal page
    Then the Feedback button is <visibility>

    Examples:
      | status     | visibility |
      | approved   | shown      |
      | signed out | hidden     |
      | pending    | hidden     |
      | blocked    | hidden     |

  Scenario: The button stays available without covering primary navigation
    Given I am an approved member
    When I open a portal page on a desktop-sized screen
    Then I see a floating "Feedback" button in the bottom-right corner

  Scenario: Admins do not manage a Feedback feature switch
    Given I am a site owner or site manager
    When I open the site settings
    Then there is no setting to turn Feedback on or off

  Scenario: The button is compact on a phone
    Given I am an approved member
    When I open a portal page on a phone-sized screen
    Then I see a floating Feedback icon in the bottom-right corner
    And its accessible name is "Feedback"

  Scenario: The button stays out of the way of full-screen experiences
    Given I am an approved member
    When a photo viewer or another full-screen dialog is open
    Then the Feedback button is hidden
    When the full-screen experience closes
    Then the Feedback button is shown again

  Scenario: Feedback opens over the current page
    Given I am an approved member
    When I choose "Feedback"
    Then a small Feedback panel opens over my current page
    And focus moves into its message box
    And I see one free-text message box and a "Send" button
    And I do not see a subject field, category field or attachment control

  Scenario: The panel is accessible by keyboard
    Given the Feedback panel is open
    When I use the keyboard
    Then focus stays within the panel until it closes
    And I can close it with its close control or the Escape key
    And focus returns to the Feedback button

  Scenario: Closing and reopening retains an unsent draft on the current page
    Given I have entered Feedback but have not sent it
    When I close and reopen the Feedback panel without leaving the page
    Then my draft is still in the message box
    But refreshing or leaving the page may discard it

  Scenario Outline: Invalid Feedback is not sent
    Given the Feedback panel is open
    And the message box contains <message>
    When I choose "Send"
    Then no Jira issue is created
    And I see <validation>

    Examples:
      | message                     | validation                                      |
      | no text                     | "Enter your feedback before sending."           |
      | whitespace only             | "Enter your feedback before sending."           |
      | more than 2,000 characters  | "Feedback must be 2,000 characters or shorter." |

  Scenario: Valid Feedback creates one Jira issue
    Given I am an approved member
    And I entered a message between 1 and 2,000 characters after trimming
    When I choose "Send"
    Then the Send button is disabled while the request is in progress
    And repeated clicks do not create additional issues
    And one unassigned Task is created in Jira project "KAN"
    And the Task has the label "mfr-feedback"
    And the Task is not assigned or labeled in a way that starts a Devin session

  Scenario: The Jira issue contains enough context to act on the Feedback
    Given I send valid Feedback
    When the Jira issue is created
    Then its summary identifies the member and summarizes the first line of the message
    And its description contains the complete Feedback message
    And its description contains my name and email address
    And its description contains the portal page path where I opened Feedback
    And its description contains a readable browser and device summary
    And its description contains the submission time
    But it contains no attachment, cookie, IP address, URL query or URL fragment

  Scenario: The site keeps no Feedback record
    Given Jira accepted my Feedback
    When submission finishes
    Then the Feedback exists in Jira as the system of record
    And no Feedback copy or status record is written to the MFR database

  Scenario: A successful submission confirms receipt without exposing Jira
    Given Jira created the issue
    When submission finishes
    Then the panel closes and its draft is cleared
    And I see a simple confirmation that the admins received my Feedback
    But the confirmation does not show the Jira issue key or link

  Scenario: The member receives the first notification
    Given Jira created issue "KAN-123" from my Feedback
    When the site sends the submission email
    Then the email contains "KAN-123"
    And it contains a copy of my original Feedback message
    And replying routes my response to the same Jira issue and the site-admin mailbox
    But it does not require or invite me to open Jira

  Scenario: A member's email reply reaches Jira and the site admins
    Given I received a creation or status email for my Feedback issue
    And I am still an approved member using the original submitting email address
    When I reply with a non-empty plain-text message
    Then the new reply text is added as a comment on the same Jira issue
    And the comment identifies me as the member who replied
    And the reply is also emailed to the configured site-admin mailbox
    And that email identifies me, includes the issue key and has my email as Reply-To
    But no new Jira issue is created and the issue's status is not changed
    And quoted email history, signatures and attachments are not copied

  Scenario Outline: Untrusted email replies cannot write to Jira or email admins
    Given an inbound email delivery has <condition>
    When the reply is processed
    Then no Jira comment is created
    And no email is forwarded to the site-admin mailbox

    Examples:
      | condition                                                   |
      | an invalid or missing inbound-provider signature            |
      | an invalid or tampered issue-specific reply address          |
      | a sender the inbound provider could not authenticate         |
      | a sender email different from the original submitting member |
      | a sender who is no longer an approved member                 |
      | an issue outside the configured project, label or creator    |

  Scenario: Automated replies do not create email loops
    Given an inbound email is a bounce, an automatic reply or a site-generated notification
    When the reply is processed
    Then no Jira comment is created
    And no email is forwarded to the site-admin mailbox

  Scenario: A failed reply destination does not undo the successful destination
    Given a valid member email reply has reached Jira or the site-admin mailbox
    And delivery to the other destination fails
    When reply processing finishes
    Then the successful comment or email is not undone
    And the failed destination and inbound delivery identifier are logged for recovery
    And recovery does not create a new Feedback issue

  Scenario: Site admins are notified of new Feedback
    Given Jira created an issue from my Feedback
    When the site sends the admin notification
    Then every approved site owner and site manager receives it
    And accounting managers do not receive it solely because of that role
    And it contains my Feedback message and a link to the Jira issue
    And replying addresses the email to me
    But no text-message notification is sent

  Scenario: Email failure does not duplicate accepted Feedback
    Given Jira created the issue
    And a member or admin notification email cannot be delivered
    When submission finishes
    Then I still see the successful submission confirmation
    And the email failure is recorded in the site logs
    And the site does not create another Jira issue

  Scenario: Jira failure preserves the member's message
    Given Jira does not confirm that it created an issue
    When I choose "Send"
    Then I see an error asking me to try again later
    And the Feedback panel stays open with my message intact
    And no success or notification email is sent
    And the site does not automatically retry the Jira request

  Scenario Outline: Every Jira status change notifies the member
    Given a valid MFR Feedback issue exists in Jira
    When its status changes to <status>
    Then a member status email is <email>

    Examples:
      | status      | email    |
      | To Do       | sent     |
      | In Progress | sent     |
      | Done        | sent     |
      | any other   | sent     |

  Scenario: Every status email identifies the Feedback and its new status
    Given my Feedback issue changes to a different status
    When the member status email is sent
    Then it contains the Jira issue key
    And it contains my original Feedback message
    And it names the status entered by that transition
    And replying routes my response to the same Jira issue and the site-admin mailbox

  Scenario: Creating Feedback in To Do does not send a second creation notification
    Given Jira created my Feedback issue with the initial status "To Do"
    When the member creation email is sent
    Then I receive that first notification with the issue key and original message
    But initial issue creation alone does not also send a status-change email

  Scenario: Editing or commenting without a status change does not notify the member
    Given a valid MFR Feedback issue exists in Jira
    When its description, label or comments change but its status does not
    Then no member status email is sent

  Scenario: The Done email includes the latest Jira comment
    Given my Feedback issue has at least one Jira comment
    When its status changes to "Done"
    Then the member status email contains the Jira issue key
    And it contains my original Feedback message
    And it says the new status is "Done"
    And it includes the latest Jira comment as the resolution note
    And replying routes my response to the same Jira issue and the site-admin mailbox

  Scenario: A Done email does not invent a resolution note
    Given my Feedback issue has no Jira comment
    When its status changes to "Done"
    Then the member status email says the Feedback is done
    But it contains no resolution note

  Scenario: Re-entering any status sends a fresh update
    Given my Feedback issue previously had the status "To Do"
    And it later moved to a different status
    When it enters "To Do" again
    Then a new member status email is sent for that transition
    And the same rule applies to re-entering any other status

  Scenario: Untrusted Jira callbacks cannot send email
    Given a request reaches the Jira status callback
    When its shared secret is wrong or missing
    Then the request is rejected
    And no email is sent

  Scenario Outline: Only site-created Feedback can trigger a status email
    Given a correctly authenticated Jira status callback
    And the referenced issue has <condition>
    When the callback is processed
    Then a member status email is <email>

    Examples:
      | condition                                                    | email    |
      | project KAN, label mfr-feedback and the configured creator   | sent     |
      | a different project                                         | not sent |
      | no mfr-feedback label                                       | not sent |
      | a different creator                                         | not sent |
      | an email that is not an approved MFR member                 | not sent |
      | missing member email or original message                    | not sent |
```

## Jira Workflow Contract

- Jira project: `KAN`.
- Issue type: `Task`.
- Label: `mfr-feedback`.
- New Feedback is unassigned. Assignment to Devin is an explicit admin action,
  never part of submission.
- The MFR deployment uses its own least-privilege Jira OAuth credential. It may
  use the same Jira service-account identity as Devin, but it must use a separate
  OAuth credential rather than copying Devin's stored secret.
- The credential may create and read issues and add reply comments in `KAN`;
  email replies do not change issue status or grant general Jira administration
  access to the MFR site.
- A Jira Automation rule sends a signed web request whenever a labeled Feedback
  Task's status changes, including entering `To Do`, `In Progress`, `Done` or
  any custom status. There is no notifying-status allowlist.
- The callback identifies the actual transition, including its previous and new
  status. Initial issue creation and edits or comments without a status change
  do not trigger status emails. Moving back to an earlier status does.
- The callback is accepted only when its shared secret, project, label, creator
  and approved member email all match.
- Because Jira comments can be copied into the Done email, every comment on an
  MFR Feedback issue must be written as member-visible text.

## Email Contract

- Submission success depends on Jira accepting the issue, not on email delivery.
- The member's creation email and every status-change email include the issue
  key and original message, but no Jira link because members are not expected to
  use Jira. Status emails name the status entered by the transition; only `Done`
  emails include the latest Jira comment as a resolution note when present.
- Every member email uses an issue-specific inbound `Reply-To` address. A valid
  member reply adds a comment to the existing Jira issue and is also forwarded to
  the configured site-admin mailbox or distribution address, reaching the site
  owners and site managers. Members do not need a Jira account.
- Reply comments contain only the new plain-text reply and identify its member
  author, even though the integration credential creates the Jira comment.
- Admins can reply directly to the member from the forwarded email. Capturing
  those direct admin replies in Jira is not part of this requirement.
- New-Feedback admin emails go to approved site owners and site managers. Their
  `Reply-To` address is the submitting member.
- CAP-010 owns non-production email redirection and failure behavior.

## Inbound Reply Contract

- Outbound SES `Reply-To` support alone does not receive email. Deployment must
  provision an inbound-email service and route the Feedback reply domain to it;
  the provider is chosen during implementation, before enabling reply handling.
- The inbound service supplies authenticated callbacks and sender-authentication
  results. MFR verifies the provider signature and freshness before trusting its
  payload; an email's unverified From or Authentication-Results headers are not
  sufficient authentication.
- Issue-specific routing data must be tamper-resistant and bound to the original
  member. Resolve the issue and member against Jira without a local Feedback
  mapping; a Jira key in the email subject is not authorization.
- Validate the configured project, label and creator, and require the
  authenticated sender to match the original submitting email of a currently
  approved member before adding a comment or forwarding to admins.
- Ignore bounces, automatic responses, site-generated mail and empty replies
  after removing quoted history and signatures. Do not import attachments.
- Preserve the inbound provider's delivery identifier in Jira comment metadata
  and the forwarded email for replay detection. Known duplicate deliveries must
  not add another comment or forward another email. Durable delivery/retry state
  belongs to the inbound service or Jira, not a new MFR Feedback table.
- Jira commenting and mailbox forwarding are separate deliveries. Record failures
  for recovery without rolling back successful delivery. An ambiguous timeout on
  either destination may still duplicate a comment or email during recovery;
  there is no cross-service exactly-once guarantee.

## Submission and Privacy Rules

- The initial Feedback message is plain text only, after trimming, with a
  2,000-character maximum.
- The source page is its relative pathname only. Query parameters and fragments
  are excluded.
- Device context is a readable browser and device summary. Cookies, IP addresses
  and other request headers are not copied into Jira.
- The site does not store Feedback, Jira issue keys or Jira status history in its
  own database.
- The client prevents repeated clicks while a request is active. With no local
  record, a later manual retry after an ambiguous network failure cannot be
  guaranteed duplicate-free; admins may close a rare duplicate in Jira.

## Deployment Configuration

- `JIRA_FEEDBACK_CLOUD_ID`
- `JIRA_FEEDBACK_PROJECT_KEY=KAN`
- `JIRA_FEEDBACK_ISSUE_TYPE=Task`
- `JIRA_FEEDBACK_LABEL=mfr-feedback`
- `JIRA_FEEDBACK_CLIENT_ID`
- `JIRA_FEEDBACK_CLIENT_SECRET`
- `JIRA_FEEDBACK_CREATOR_ACCOUNT_ID`
- `JIRA_FEEDBACK_WEBHOOK_SECRET`
- `FEEDBACK_REPLY_DOMAIN` (inbound domain for issue-specific member replies)
- `FEEDBACK_REPLY_TOKEN_SECRET` (protects issue/member routing data)
- `FEEDBACK_INBOUND_WEBHOOK_SECRET` (provider callback verification credential)
- `FEEDBACK_REPLY_TO` (destination site-admin mailbox, not the member Reply-To)

Secrets are stored in Vercel and are never exposed to the browser. Production
and Preview use separate Jira credentials or Preview leaves Jira Feedback
disabled, so testing cannot create Tasks on the live board.
Inbound reply routing and credentials are also environment-isolated; Preview
must not comment on production issues or forward email to real member/admin
addresses. The implementation must document the inbound provider, domain/DNS
setup, callback verification and delivery recovery procedure before launch.

## Related Features

- CAP-003 Access for unapproved accounts: pending and blocked accounts cannot
  see or submit Feedback.
- CAP-004 Admin roles: site owners and site managers receive admin notifications.
- CAP-010 Email safety outside production: Feedback emails follow the same
  redirection, logging and failure rules as every other site email.

## Proposed Code Seams

- `apps/mfr/app/layout.tsx`: approved-member visibility for the global control.
- `apps/mfr/app/FeedbackButton.tsx`: floating button, panel and client state.
- `apps/mfr/app/api/feedback/route.ts`: authorization, validation and Jira
  creation.
- `apps/mfr/app/api/feedback/jira-status/route.ts`: authenticated status callback.
- `apps/mfr/app/api/feedback/email-reply/route.ts`: authenticated inbound-email
  callback, member/issue validation, Jira comment and admin forwarding.
- `apps/mfr/lib/feedback/`: Jira client, payload validation and Feedback emails.
- `apps/mfr/lib/reservations/email.ts`: existing SES sender and `Reply-To`
  support, preferably extracted rather than duplicated.

## Change Log

- 2026-10-18: Specified from the Member Feedback design interview.
- 2026-10-18: Member email replies add a Jira comment and reach the admin mailbox,
  and every status change now notifies the member, including `To Do`, per PR
  review.
