# Member Feedback: setup and operations (CAP-048)

Approved members send Feedback from a floating button on every portal page.
Each submission creates one unassigned Task in Jira project `KAN`, labeled
`mfr-feedback`. Jira is the system of record: MFR stores nothing in its own
database. The behavior is specified in
[CAP-048](../requirements/portal/member-feedback.md).

| Piece                    | Where                                                                 |
| ------------------------ | --------------------------------------------------------------------- |
| Button and panel         | `apps/mfr/app/FeedbackButton.tsx` (rendered by `layout.tsx`)          |
| Submit                   | `POST /api/feedback`                                                  |
| Jira status callback     | `POST /api/feedback/jira-status`                                      |
| Inbound email replies    | `POST /api/feedback/email-reply?token=…` (SNS subscription)           |
| Jira client, rules, mail | `apps/mfr/lib/feedback/`, `apps/mfr/emails/portal/FeedbackEmails.tsx` |

## How it works

1. **Submit.** The route checks the member is approved, validates the message
   (1 to 2,000 characters after trimming) and creates the Task. The summary is
   `Feedback from <name>: <first line>`. The description holds the message,
   the member's name and email, the page path (no query or fragment), a
   browser/device summary such as `Chrome 128 on macOS (desktop)` and the
   submission time. No cookies, IP address or raw headers are sent. The issue
   also gets an `mfr-feedback` **issue property** holding the member's email,
   name and original message: callbacks read it instead of a local table.
   A Jira failure returns an error to the member and is never retried.
2. **Creation emails.** The member gets the issue key and their message, with
   an issue-specific Reply-To. Approved site owners and site managers get the
   message and a Jira link, with Reply-To set to the member. Email failures are
   logged and don't affect the submission.
3. **Status emails.** A Jira Automation rule calls the status callback on every
   status transition. The route re-reads the issue and emails the member only
   if the issue is in the configured project, has the label, was created by
   the MFR integration account, has the Feedback property, and the member is
   still approved. A Done email includes the latest Jira comment as the
   resolution note, if any.
4. **Replies.** Member replies go to
   `feedback+<issue-key>-<hmac>@<FEEDBACK_REPLY_DOMAIN>`. The HMAC binds the
   address to the issue and the original member's email, so it can't be
   altered. SES receives the mail and publishes it to SNS, which posts it to the
   reply route. The route checks the subscription token, the SNS signature and
   timestamp (under 6 hours old, so SNS retries of a 503 still get through;
   duplicates are caught by the delivery id), the configured topic ARN, the SES
   DMARC verdict (a DMARC pass is
   required; a bare DKIM pass is not accepted because SES does not check that
   the signing domain is aligned with the From address), drops bounces,
   auto-replies and site-generated mail,
   then re-validates the issue and member in Jira and MFR. The new text (quoted
   history and signatures stripped, attachments ignored) is added as a Jira
   comment and forwarded to `FEEDBACK_REPLY_TO`. The SES message id is stored
   as a comment property, so a redelivered message is ignored.

The feature is dormant wherever its variables are missing: the button still
shows, but sending reports "Feedback could not be sent right now" and the two
callbacks return 404.

## Environment variables

All are server-only. Set them on the `mfr_web` Vercel project.

| Variable                           | Value                                                                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `JIRA_FEEDBACK_CLOUD_ID`           | The Jira site's cloud id (`https://<site>.atlassian.net/_edge/tenant_info`)                                                              |
| `JIRA_FEEDBACK_PROJECT_KEY`        | `KAN` (default)                                                                                                                          |
| `JIRA_FEEDBACK_ISSUE_TYPE`         | `Task` (default)                                                                                                                         |
| `JIRA_FEEDBACK_LABEL`              | `mfr-feedback` (default)                                                                                                                 |
| `JIRA_FEEDBACK_CLIENT_ID`          | OAuth client id of the MFR service account's credential                                                                                  |
| `JIRA_FEEDBACK_CLIENT_SECRET`      | Its client secret                                                                                                                        |
| `JIRA_FEEDBACK_CREATOR_ACCOUNT_ID` | The service account's Atlassian account id (issue creator check)                                                                         |
| `JIRA_FEEDBACK_WEBHOOK_SECRET`     | Random secret the Automation rule sends as `Authorization: Bearer`                                                                       |
| `FEEDBACK_REPLY_DOMAIN`            | Inbound reply domain, e.g. `reply.millerfamilyreunions.org`                                                                              |
| `FEEDBACK_REPLY_TOKEN_SECRET`      | Random secret that signs reply addresses (rotating it breaks old addresses)                                                              |
| `FEEDBACK_INBOUND_WEBHOOK_SECRET`  | Random secret in the SNS subscription URL's `token` parameter                                                                            |
| `FEEDBACK_SNS_TOPIC_ARN`           | ARN of the `mfr-feedback-replies` topic; required: replies stay off until it is set, and notifications from any other topic are rejected |
| `FEEDBACK_REPLY_TO`                | Site-admin mailbox that receives forwarded member replies                                                                                |

Generate secrets with `openssl rand -hex 32`.

**Environment isolation.** Set the Jira and reply variables on **Production
only**. Preview and local leave them unset, so testing never creates Tasks on
the live board, never comments on production issues and never forwards to real
addresses. (Mail is also redirected outside Production by the `EMAIL_ENABLED`
guard.) To exercise the flow in Preview, use a separate Jira site or project
with its own service account and credential, plus a separate reply domain and
SNS topic.

## One-time setup

### 1. Jira service account and credential

Do not reuse Devin's Jira credential.

1. In admin.atlassian.com → Directory → Service accounts, create
   `MFR Feedback`. Give it access to the Jira product.
2. In project `KAN` → Project settings → Access/Permissions, allow it to
   _Browse projects_, _Create issues_ and _Add comments_, nothing more. It
   needs no admin rights and must not be assignable.
3. On the service account, create an **OAuth 2.0 credential** with scopes
   `read:jira-work` and `write:jira-work` (or the granular
   `read:issue:jira`, `write:issue:jira`, `read:comment:jira`,
   `write:comment:jira`, `read:issue.property:jira`, `write:issue.property:jira`,
   `read:comment.property:jira`, `write:comment.property:jira`). Copy the client
   id and secret into `JIRA_FEEDBACK_CLIENT_ID` / `JIRA_FEEDBACK_CLIENT_SECRET`.
4. Put the service account's account id into `JIRA_FEEDBACK_CREATOR_ACCOUNT_ID`.

### 2. Jira Automation rule (status emails)

In `KAN` → Project settings → Automation → Create rule:

- **Trigger:** _Issue transitioned_ (any from/to status).
- **Condition:** _Issue fields condition_: Labels contains `mfr-feedback`.
- **Action:** _Send web request_
  - URL: `https://millerfamilyreunions.org/api/feedback/jira-status`
  - Method `POST`, header `Authorization: Bearer <JIRA_FEEDBACK_WEBHOOK_SECRET>`
    (mark the header as hidden)
  - Body (custom data):
    ```json
    {
      "issueKey": "{{issue.key}}",
      "fromStatus": "{{fromStatus.name}}",
      "toStatus": "{{toStatus.name}}"
    }
    ```

Issue creation, edits and comments are not transitions, so they don't trigger
the rule. Moving back to an earlier status is a transition and sends a fresh
email.

### 3. Inbound replies (SES receiving → SNS)

SES email receiving runs only in some regions (e.g. `us-east-1`).

1. **DNS.** Add an MX record for the reply domain:
   `reply.millerfamilyreunions.org MX 10 inbound-smtp.us-east-1.amazonaws.com`.
   Verify the domain as an SES identity in the same region.
2. **SNS topic.** Create `mfr-feedback-replies`. Add an HTTPS subscription to
   `https://millerfamilyreunions.org/api/feedback/email-reply?token=<FEEDBACK_INBOUND_WEBHOOK_SECRET>`
   with _raw message delivery off_. The route confirms the subscription itself
   once it validates the SNS signature (look for `SNS subscription confirmed`
   in the logs; `SNS subscription confirmation failed` means SNS rejected the
   confirm call and the subscription is still pending). Set
   `FEEDBACK_SNS_TOPIC_ARN` to the topic's ARN. Give the subscription a
   delivery policy that finishes retrying within about an hour (e.g. 20 retries
   with exponential backoff up to a 5-minute delay): the route answers 503 while
   Jira is unreachable so SNS retries, and messages older than 6 hours are
   rejected as stale.
3. **SES receipt rule.** In the active receipt rule set, add a rule for the
   reply domain with spam/virus scanning on and one action: _Publish to SNS
   topic_ `mfr-feedback-replies`, encoding **Base64**. SNS actions carry messages
   up to 150 KB, which plain-text replies fit easily; larger mail (big
   attachments) is dropped by SES.
4. Optionally add an _S3_ action before the SNS action to keep raw messages
   for recovery (set a short lifecycle rule).

## Recovery

Every failure is logged in Vercel with a `feedback` message prefix.

- **Submission failed** (`feedback: Jira issue creation failed`): the member
  saw an error and kept their draft. Nothing to recover. If Jira timed out but
  did create the issue, a manual resend can duplicate it; close the duplicate.
- **Creation email failed** (`feedback: notification emails failed`,
  `could not list site admins`, or an SES error): the issue exists. Email the
  member and admins by hand with the issue key.
- **Reply partly delivered**: the log line includes `destination` (`jira` or
  `admin-mailbox`), `deliveryId` (the SES message id) and `issueKey`.
  - `jira`: the admins have the reply; add it to the issue as a comment by hand.
  - `admin-mailbox`: the reply is on the Jira issue; forward it by hand.
    Never create a new issue for a reply. The forwarded email and the Jira comment
    both show the delivery id.
- **Reply not processed** (`feedback reply: processing failed`, HTTP 503): Jira
  was unreachable before anything was delivered. SNS retries automatically; if
  its retries run out, use the S3 copy (if enabled) and add the comment by hand.
- **Ignored replies** are logged as `feedback reply: ignored` with a reason
  (unauthenticated sender, tampered address, not the original member, member
  no longer approved, automated message, empty reply, not site-created issue).
