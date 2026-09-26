---
id: CAP-020
title: Book a stay
area: reservations
status: implemented
source: recovered
related: [CAP-009, CAP-021, CAP-022, CAP-025, CAP-029]
---

# Book a stay

```gherkin
Feature: Book a stay
  Pick check-in and check-out dates and get a confirmed stay immediately.
  Capability: CAP-020

  Background:
    Given I am signed in as an approved member
    And the booking rules have been set up

  Scenario: Two clicks on the calendar choose check-in and check-out
    Given I am on the cabin calendar
    When I click July 10, 2027
    Then I see "Check-in Jul 10 — now pick a check-out date"
    When I click July 13, 2027
    Then the booking dialog opens with check-in July 10, 2027 and check-out July 13, 2027
    And I see "3 nights at the cabin"

  Scenario: Clicking the later day first still books forwards
    Given I am on the cabin calendar
    When I click July 13, 2027 and then July 10, 2027
    Then the booking dialog opens with check-in July 10, 2027 and check-out July 13, 2027

  Scenario: Clicking the check-in day again does not complete the selection
    # Checking out on the check-in day would be a zero-night stay.
    Given I am on the cabin calendar
    And I have clicked July 10, 2027 as my check-in
    When I click July 10, 2027 again
    Then no booking dialog opens
    And I am still asked to pick a check-out date

  Scenario: I can clear a half-made selection
    Given I am on the cabin calendar
    And I have clicked July 10, 2027 as my check-in
    When I press "Clear"
    Then no dates are selected
    And I see "Pick a check-in date, then a check-out date to reserve the cabin — or hit New reservation."

  Scenario: New reservation starts from today for two nights
    Given today is March 10, 2027
    When I press "New reservation"
    Then the booking dialog opens with check-in March 10, 2027 and check-out March 12, 2027

  Scenario: Check-out must be at least one day after check-in
    Given the booking dialog is open with check-in July 10, 2027
    When I choose a check-out date
    Then the earliest check-out I can pick is July 11, 2027

  Scenario Outline: The dialog counts nights
    Given the booking dialog is open
    When I choose check-in <check_in> and check-out <check_out>
    Then I see "<summary>"

    Examples:
      | check_in      | check_out     | summary                  |
      | July 10, 2027 | July 11, 2027 | 1 night at the cabin     |
      | July 10, 2027 | July 17, 2027 | 7 nights at the cabin    |

  Scenario: Confirming books the stay immediately
    Given the booking dialog shows valid dates July 10, 2027 to July 13, 2027
    When I press "Confirm reservation"
    Then my stay is confirmed straight away with no approval step
    And it appears on the cabin calendar as my stay
    And it appears under My reservations as "Jul 10 → Jul 13"
    And I am sent a booking confirmation email
    And the booking appears in the site activity feed

  Scenario: Dates that break a booking rule cannot be confirmed
    Given another member has a stay from July 10, 2027 to July 13, 2027
    When I choose check-in July 11, 2027 and check-out July 12, 2027 in the booking dialog
    Then I see "Those dates overlap an existing reservation."
    And "Confirm reservation" is disabled

  Scenario: Someone else takes the dates while I am deciding
    Given the booking dialog shows dates that were free when I opened it
    And another member books overlapping dates before I confirm
    When I press "Confirm reservation"
    Then I see "Those dates were just booked or blocked by someone else. Please pick different dates."
    And no stay is saved for me
    And I can change the dates in the same dialog and try again

  Scenario: Two members confirming the same dates at the same moment
    Given two members confirm overlapping stays at the same moment
    Then exactly one of the stays is confirmed
    And the other member is told those dates were just taken

  Scenario: The calendar cannot be used before booking rules exist
    Given no booking rules have been set up yet
    When I open the cabin calendar
    Then I see "The calendar isn’t set up yet — an admin needs to configure booking rules under Admin → Booking Rules."
    And I cannot book a stay
```

## Open Questions

- **[low]** The dialog asks only for dates. There is no guest count, note or "who's coming" field, so other members see only the booker's name. Is that intended? (`apps/mfr/app/reservations/(app)/calendar/BookingPanel.tsx:35-40`)

## Related Features

- CAP-009 Site activity feed — each booking is recorded there
- CAP-021 Booking limits — every rule the dialog checks lives there
- CAP-022 Cabin calendar — where dates are picked
- CAP-025 Manage all reservations — admins book on a member's behalf
- CAP-029 Reservation emails — the confirmation email

## Code References

- `apps/mfr/app/reservations/(app)/calendar/CalendarClient.tsx:62-125` — click selection, "New reservation" defaults, selection banner, missing-rules message (:100-108)
- `apps/mfr/app/reservations/(app)/calendar/calendarSelection.ts:20-37` — two-click selection logic
- `apps/mfr/app/reservations/(app)/calendar/BookingPanel.tsx:69-227` — booking dialog, live validation, night count, submit
- `apps/mfr/app/reservations/api/reservations/route.ts:72-194` — create, server validation, race-loss message
- `apps/mfr/lib/db/push-only.sql:13-73` — database overlap backstop
- `apps/mfr/tests/reservations-integration/concurrency.test.ts:155` — simultaneous booking race
- `e2e/tests/reservations-lifecycle.spec.ts:23-54` — create via UI

## Change Log

- 2026-09-26 — Recovered from code.
