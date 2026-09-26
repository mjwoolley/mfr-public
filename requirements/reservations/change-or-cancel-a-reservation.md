---
id: CAP-024
title: Change or cancel a reservation
area: reservations
status: implemented
source: recovered
related: [CAP-009, CAP-021, CAP-022, CAP-023, CAP-025, CAP-029]
---

# Change or cancel a reservation

```gherkin
Feature: Change or cancel a reservation
  The owner or an admin changes dates or cancels.
  Capability: CAP-024

  Background:
    Given I am signed in as an approved member
    And I have a stay from July 10, 2027 to July 13, 2027

  Scenario: I change the dates of my stay
    When I press "Edit" on my stay
    And I change the check-out to July 14, 2027
    And I press "Save changes"
    Then my stay shows as "Jul 10 → Jul 14"
    And I am sent a reservation updated email
    And the change appears in the site activity feed

  Scenario: The edit dialog starts from my current dates
    When I press "Edit" on my stay
    Then I see the "Edit reservation" dialog with check-in July 10, 2027 and check-out July 13, 2027

  Scenario: New dates must still meet the booking limits
    Given another member has a stay from July 14, 2027 to July 16, 2027
    When I change my check-out to July 15, 2027
    Then I see "Those dates overlap an existing reservation."
    And "Save changes" is disabled

  Scenario: My stay does not clash with itself
    When I change my check-in to July 11, 2027
    Then the change is allowed

  Scenario: Saving without changing the dates sends no email
    When I open "Edit" on my stay and press "Save changes" without changing anything
    Then my stay is unchanged
    And no reservation email is sent

  Scenario: Someone takes the new dates first
    Given I am changing my stay to end on July 15, 2027
    And another member books July 14, 2027 before I save
    When I press "Save changes"
    Then I see "Those dates were just booked or blocked by someone else. Please pick different dates."
    And my stay keeps its old dates

  Scenario: I cancel my stay
    When I press "Cancel" on my stay
    Then my stay no longer appears on My reservations, the cabin calendar or the reservations summary
    And July 10 to July 13, 2027 can be booked by anyone
    And I am sent a reservation cancelled email
    And the cancellation appears in the site activity feed

  Scenario: Cancelling a stay twice has no further effect
    Given my stay has already been cancelled
    When the same stay is cancelled again
    Then nothing changes
    And no second cancellation email is sent

  Scenario: Other members cannot change or cancel my stay
    Given another approved member views my stay on the calendar
    Then they are not offered "Edit" or "Cancel reservation"
    When they try to change or cancel it without using the booking screens
    Then their change is refused and nothing is saved

  Scenario: A reservations admin can change or cancel my stay
    Given a reservations admin changes my stay's check-out to July 14, 2027
    Then my stay shows as "Jul 10 → Jul 14"
    And the reservation updated email I receive says who made the change
```

## Open Questions

- **[high]** Nothing stops a member cancelling or re-dating a stay that is already over. The calendar's stay details offer "Edit" and "Cancel reservation" on my past stays, and changes are exempt from the past-date rule. Cancelling a finished stay removes it from the summary and frees those nights under the yearly limit, so the limit can be gamed after the fact. Should finished stays be locked for members? (`apps/mfr/app/reservations/(app)/calendar/ReservationViewDialog.tsx:72-87`; `apps/mfr/app/reservations/api/reservations/[id]/route.ts:34-147`; `apps/mfr/lib/reservations/rules/validateReservation.ts:97`)
- **[high]** A cancelled stay can still have its dates changed outside the booking screens. The change is saved, logged as a change, and the owner is emailed "Reservation updated", yet the stay stays cancelled. Should changes to cancelled stays be refused? (`apps/mfr/app/reservations/api/reservations/[id]/route.ts:34-131`)
- **[medium]** "Cancel" cancels immediately, with no "are you sure?" and no undo, and the dates are free for others at once. The booking dialog's close button is also labelled "Cancel". Should cancelling ask for confirmation? (`apps/mfr/app/reservations/(app)/my-reservations/MyReservationsClient.tsx:145-153`; `apps/mfr/app/reservations/(app)/calendar/ReservationViewDialog.tsx:72-81`; `apps/mfr/app/reservations/(app)/calendar/BookingPanel.tsx:210-212`)

## Related Features

- CAP-009 Site activity feed — changes and cancellations are recorded there
- CAP-021 Booking limits — changed dates are re-checked against every rule
- CAP-022 Cabin calendar — Edit and Cancel from the stay's details
- CAP-023 My reservations — Edit and Cancel from the list
- CAP-025 Manage all reservations — admins change or cancel anyone's stay
- CAP-029 Reservation emails — updated and cancelled emails

## Code References

- `apps/mfr/app/reservations/api/reservations/[id]/route.ts:27-147` — change: ownership check, re-validation, email only when dates changed
- `apps/mfr/app/reservations/api/reservations/[id]/route.ts:149-203` — cancel: soft cancel, idempotent
- `apps/mfr/app/reservations/(app)/calendar/useReservationMutations.ts` — change/cancel calls and error messages
- `apps/mfr/app/reservations/(app)/calendar/BookingPanel.tsx` — "Edit reservation" dialog
- `apps/mfr/tests/reservations-integration/reservations.test.ts:286-420` — owner edit/cancel, 403/404
- `apps/mfr/tests/reservations-integration/notifications.test.ts:202-240` — unchanged dates, repeat cancel

## Change Log

- 2026-09-26 — Recovered from code.
