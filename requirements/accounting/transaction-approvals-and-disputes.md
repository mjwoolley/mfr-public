---
id: CAP-032
title: Transaction approvals and disputes
area: accounting
status: implemented
source: recovered
related: [CAP-031, CAP-033, CAP-034, CAP-035, CAP-036, CAP-043]
---

# Transaction approvals and disputes

```gherkin
Feature: Transaction approvals and disputes
  Shareholders confirm or dispute entries; admins resolve disputes.
  Capability: CAP-032

  # Owns the rule that balances count every entry whatever its approval state.

  Scenario: Every recorded entry waits for each affected shareholder's approval
    Given I am signed in as a member linked to a shareholder record
    When an admin records a share purchase, transfer, adjustment or correction that affects me
    Then it appears in my inbox waiting for my approval

  Scenario: Entries count toward balances before and regardless of approval
    Given I am signed in as a member linked to a shareholder record
    And an admin recorded a share purchase of 250 shares for me that I have not reviewed
    When I open my inbox
    Then I see "These are already reflected in your balance. Confirming just acknowledges you've seen them — it doesn't change anything. If something looks wrong, dispute it instead."
    And my balance already includes the 250 shares
    And the shares still count if I later dispute the entry

  Scenario: Confirming an entry clears it from my inbox
    Given I am signed in as a member linked to a shareholder record
    And one entry is waiting for my approval
    When I choose "Confirm" on it
    Then I see "You're all caught up"
    And "Nothing pending your approval."
    And the entry is tagged "Approved" in my history

  Scenario: Disputing needs a reason
    Given I am signed in as a member linked to a shareholder record
    And one entry is waiting for my approval
    When I choose "Dispute"
    Then I am asked "Why are you disputing this?"
    And "Submit dispute" stays unavailable until I type a reason
    And a reason made only of spaces is refused with "A reason is required to dispute a transaction"

  Scenario: A disputed entry leaves the inbox and shows on my dashboard
    Given I am signed in as a member linked to a shareholder record
    When I submit a dispute with the reason "Amount is off by 50"
    Then the entry leaves my inbox
    And on my dashboard it is tagged "Disputed" with "Your dispute: Amount is off by 50"

  Scenario: I can change my mind on an open dispute
    Given I am signed in as a member linked to a shareholder record
    And I have an open dispute that no admin has resolved
    When I choose "Edit reason" and save a new reason
    Then my dispute shows the new reason
    And I can instead choose "Confirm anyway" to mark the entry "Approved"

  Scenario: I can only act on my own approvals
    Given I am signed in as a member linked to a shareholder record
    When I try to confirm, dispute or edit the dispute on another shareholder's entry without using my own inbox
    Then nothing changes on their entry

  Scenario: An admin resolves a dispute with or without a correction
    Given I am signed in as an accounting admin
    And a shareholder has disputed an entry
    When I choose "Mark resolved", optionally give the correction's identifier, and choose "Confirm resolved"
    Then the dispute is shown as "Disputed (resolved)" to admins
    And the shareholder sees "Resolved" with the date, and the correction's reference when one was given
    But the entry is never shown as "Approved" because of my resolution

  Scenario: Only accounting admins can resolve disputes
    Given I am signed in as a member who is not an accounting admin
    When I try to resolve a dispute without using the admin screens
    Then nothing changes on the dispute
```

## Open Questions

- **[medium]** A shareholder can still edit their dispute reason after an admin has marked it resolved, because a resolved dispute keeps its disputed status. Should resolved disputes be locked? (`apps/mfr/actions/accounting/approvals.ts:72-96, 105-122`)
- **[medium]** Recording a correction does not resolve the dispute that prompted it; the admin must also "Mark resolved" and type the correction's identifier by hand. The identifier is never checked, and the screens only ever show its last 4–6 characters. Should a correction resolve its dispute automatically? (`apps/mfr/actions/accounting/approvals.ts:105-122`, `apps/mfr/app/accounting/admin/activity/resolve-dispute-form.tsx`)
- **[medium]** Nobody is notified when a shareholder disputes an entry. Admins only find out by checking the activity log. Should admins be emailed? (`apps/mfr/actions/accounting/approvals.ts:42-70`)

- **[medium]** Corrected transactions stay in the inbox. When a transaction is corrected, its unreviewed approvals remain in the shareholder's inbox and inbox count. The inbox says entries "are already reflected in your balance", but the corrected original no longer counts. Should they be withdrawn or labelled as corrected? (`apps/mfr/app/accounting/inbox/page.tsx:17-32`, `apps/mfr/components/accounting/nav.tsx:25-36`)

## Related Features

- CAP-031 Shareholder dashboard — shows approval tags and open-dispute controls
- CAP-033 Record a share purchase — creates an approval for the shareholder
- CAP-034 Share transfers — creates an approval for each party
- CAP-035 Balance adjustments — creates an approval for the shareholder
- CAP-036 Transaction corrections — creates approvals, and is how a dispute is usually fixed
- CAP-043 Accounting activity log — where admins see and resolve disputes

## Code References

- `apps/mfr/actions/accounting/approvals.ts` — confirm, dispute, edit reason, resolve (own-row scoping)
- `apps/mfr/app/accounting/inbox/page.tsx` — inbox list, intro text, empty state
- `apps/mfr/app/accounting/inbox/inbox-approval-actions.tsx` — Confirm / Dispute controls
- `apps/mfr/app/accounting/dashboard/dispute-actions.tsx` — Confirm anyway / Edit reason
- `apps/mfr/app/accounting/admin/activity/page.tsx:122-178` — admin dispute display
- `apps/mfr/app/accounting/admin/activity/resolve-dispute-form.tsx` — Mark resolved
- `apps/mfr/tests/accounting-integration/approvals.test.ts` — lifecycle and scoping tests

## Change Log

- 2026-09-26 — Recovered from code.
