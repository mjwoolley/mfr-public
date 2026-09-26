---
id: CAP-029
title: Reservation emails
area: reservations
status: implemented
source: recovered
related: [CAP-010, CAP-020, CAP-024]
---

# Reservation emails

```gherkin
Feature: Reservation emails
  Confirmation, change and cancel emails with admins copied.
  Capability: CAP-029

  # "Reservations admins" are site owners and site managers. How emails are
  # held back outside production is covered by CAP-010.

  Scenario: I get a confirmation when I book
    Given I am signed in as an approved member
    When I book July 10, 2027 to July 13, 2027
    Then I am emailed "Reservation confirmed: Jul 10, 2027 – Jul 13, 2027"
    And it shows "Check-in: Sat, July 10, 2027", "Check-out: Tue, July 13, 2027" and "Nights: 3"
    And it has a "View the calendar" link

  Scenario: Reservations admins are copied on every reservation email
    Given two site managers have approved accounts
    And a third site manager's account is still pending approval
    When I book a stay
    Then both approved site managers are copied on my confirmation
    And the pending site manager is not copied

  Scenario: The owner is not copied on their own email
    Given I am signed in as a site manager
    When I book a stay for myself
    Then the confirmation is addressed to me
    And I am not also copied on it
    But the other reservations admins are copied

  Scenario: I am told when my dates change
    Given I have a stay from July 10, 2027 to July 13, 2027
    When I change it to July 11, 2027 to July 14, 2027
    Then I am emailed "Reservation updated: now Jul 11, 2027 – Jul 14, 2027"
    And it shows "Previous dates: Sat, July 10, 2027 – Tue, July 13, 2027"
    And it shows "New check-in: Sun, July 11, 2027", "New check-out: Wed, July 14, 2027" and "Nights: 3"

  Scenario: I am told when an admin changes my stay
    Given I have a stay from July 10, 2027 to July 13, 2027
    When the site manager Ada changes its dates
    Then my reservation updated email says "Changed by Ada."
    And replying to the email goes to Ada

  Scenario: I am told when my stay is cancelled
    Given I have a stay from July 10, 2027 to July 13, 2027
    When it is cancelled
    Then I am emailed "Reservation cancelled: Jul 10, 2027 – Jul 13, 2027"
    And it says "Your reservation from Sat, July 10, 2027 to Tue, July 13, 2027 has been cancelled."
    And it says "The dates are now open for others to book."

  Scenario: I am told when an admin cancels my stay
    Given I have a stay from July 10, 2027 to July 13, 2027
    When the site manager Ada cancels it
    Then my cancellation email says "Cancelled by Ada."
    And replying to the email goes to Ada

  Scenario Outline: Every reservation email explains who is copied
    When I receive a <email> email
    Then it says "Reservations admins are CC'd on this <word>. If something looks wrong, just reply to this email."

    Examples:
      | email                    | word         |
      | reservation confirmed    | confirmation |
      | reservation updated      | notification |
      | reservation cancelled    | notification |

  Scenario Outline: No email when nothing was booked or changed
    Given I am signed in as an approved member
    When <action>
    Then no reservation email is sent

    Examples:
      | action                                                         |
      | my booking is refused by a booking limit                       |
      | I save my stay without changing its dates                      |
      | a stay that is already cancelled is cancelled again            |

  Scenario: A failed email does not undo the booking
    Given reservation emails cannot be sent right now
    When I book a stay
    Then my stay is still confirmed
```

## Open Questions

- **[medium]** Every email says "just reply to this email", but a reply-to address is set only when an admin made the change. Replies to confirmations, and to changes or cancellations the member made themselves, go to the general sender address. Is anyone reading that inbox? Every change also copies every site owner and site manager, which may be noisy. (`apps/mfr/lib/reservations/notifications.ts:110-121, 148-154`; `apps/mfr/lib/reservations/email.ts:122`)
- **[medium]** Failed sends are logged and otherwise ignored. Nobody is alerted, and the member gets no sign their confirmation didn't go out. Is silent failure acceptable? (`apps/mfr/lib/reservations/email.ts:136-138`; `docs/backlog.md` "Email can stop working and nothing would notice")
- **[medium]** There is an unused "reminder sent" marker on each reservation but no reminder email or schedule. Was a pre-arrival reminder planned? (`apps/mfr/lib/db/schema/reservations.ts:22`; `apps/mfr/vercel.json`)

## Related Features

- CAP-010 Email safety outside production — how these emails are held back in test and preview
- CAP-020 Book a stay — triggers the confirmation
- CAP-024 Change or cancel a reservation — triggers the updated and cancelled emails

## Code References

- `apps/mfr/lib/reservations/notifications.ts` — recipients (owner + approved admins, owner removed from copies), subjects, reply-to
- `apps/mfr/emails/reservations/ReservationConfirmation.tsx`, `ReservationUpdated.tsx`, `ReservationCancelled.tsx` — email wording
- `apps/mfr/lib/reservations/email.ts:91-139` — sending, failures swallowed
- `apps/mfr/app/reservations/api/reservations/route.ts:170-178` — confirmation after the booking is saved
- `apps/mfr/app/reservations/api/reservations/[id]/route.ts:117-131, 165-200` — updated only when dates change; no repeat cancel email
- `apps/mfr/tests/reservations-integration/notifications.test.ts:118-240` — recipients, admin reply-to, no-send cases

## Change Log

- 2026-09-26 — Recovered from code.
