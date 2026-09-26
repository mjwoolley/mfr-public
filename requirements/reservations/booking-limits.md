---
id: CAP-021
title: Booking limits
area: reservations
status: implemented
source: recovered
related: [CAP-020, CAP-024, CAP-025, CAP-026, CAP-027]
---

# Booking limits

```gherkin
Feature: Booking limits
  Every booking rule: past dates, horizon, max consecutive nights, yearly cap, overlaps, turnover.
  Capability: CAP-021

  # These rules apply the same way to new bookings, date changes and admin
  # bookings made for a member. The booking dialog checks them as I type, and
  # they are enforced again when the booking is saved, even if the booking
  # screens are bypassed. A stay's check-out day is not a booked night.

  Background:
    Given the booking horizon is December 31, 2030
    And the maximum stay is 14 consecutive nights
    And the yearly limit is 60 nights per person
    And today is March 10, 2027

  Scenario: Check-out must be after check-in
    Given I am signed in as an approved member
    When I try to book with check-in and check-out both on July 10, 2027
    Then I see "The end date must be after the start date."
    And the stay cannot be confirmed

  Scenario Outline: A new stay cannot be entirely in the past
    Given I am signed in as an approved member
    When I try to book check-in <check_in> and check-out <check_out>
    Then the booking is <outcome>

    Examples:
      | check_in       | check_out      | outcome                                                              |
      | March 5, 2027  | March 9, 2027  | refused with "New reservations can't be entirely in the past."       |
      | March 8, 2027  | March 10, 2027 | refused with "New reservations can't be entirely in the past."       |
      | March 9, 2027  | March 11, 2027 | allowed                                                              |
      | March 10, 2027 | March 12, 2027 | allowed                                                              |

  Scenario: Admins may record stays that are already over
    Given I am signed in as a reservations admin
    When I book check-in March 5, 2027 and check-out March 9, 2027
    Then the booking is allowed

  Scenario: A stay already under way can be extended
    Given I am signed in as an approved member
    And I have a stay from March 8, 2027 to March 11, 2027
    When I change its check-out to March 13, 2027
    Then the change is allowed

  Scenario Outline: Stays cannot start after the booking horizon
    Given I am signed in as an approved member
    When I try to book check-in <check_in> and check-out <check_out>
    Then the booking is <outcome>

    Examples:
      | check_in          | check_out         | outcome                                                                                         |
      | December 30, 2030 | December 31, 2030 | allowed                                                                                         |
      | December 31, 2030 | January 1, 2031   | allowed                                                                                         |
      | January 1, 2031   | January 3, 2031   | refused with "Reservations cannot start after 2030-12-31. That date range isn't open yet."    |

  Scenario Outline: A stay cannot exceed the maximum consecutive nights
    Given I am signed in as an approved member
    When I try to book a stay of <nights> nights starting July 1, 2027
    Then the booking is <outcome>

    Examples:
      | nights | outcome                                                                  |
      | 14     | allowed                                                                  |
      | 15     | refused with "Reservations cannot exceed 14 consecutive nights."         |

  Scenario Outline: A person's nights in a calendar year are capped
    Given I am signed in as an approved member
    And I already have 50 confirmed nights in stays starting in 2027
    When I try to book a stay of <nights> nights starting August 1, 2027
    Then the booking is <outcome>

    Examples:
      | nights | outcome                                                          |
      | 10     | allowed                                                          |
      | 11     | refused with "This would exceed your 60-night limit for 2027."   |

  Scenario: A stay counts entirely toward the year it starts in
    Given I am signed in as an approved member
    And I already have 58 confirmed nights in stays starting in 2027
    When I try to book check-in December 30, 2027 and check-out January 3, 2028
    Then I see "This would exceed your 60-night limit for 2027."

  Scenario: Other members' nights and cancelled stays do not count toward my limit
    Given I am signed in as an approved member
    And another member has 60 confirmed nights in 2027
    And I have cancelled stays in 2027 totalling 30 nights
    When I book a 14-night stay starting August 1, 2027
    Then the booking is allowed

  Scenario: Changing a stay does not count its old nights twice
    Given I am signed in as an approved member
    And I have 60 confirmed nights in 2027, including a 10-night stay starting July 1, 2027
    When I move that stay to start August 1, 2027 with the same 10 nights
    Then the change is allowed

  Scenario: An admin booking for a member uses the member's limit
    Given I am signed in as a reservations admin
    And a member already has 55 confirmed nights in 2027
    When I book a 6-night stay for that member starting August 1, 2027
    Then I see "This would exceed your 60-night limit for 2027."
    And no stay is saved

  Scenario Outline: Stays cannot overlap anyone's confirmed stay
    Given I am signed in as an approved member
    And another member has a stay from July 10, 2027 to July 13, 2027
    When I try to book check-in <check_in> and check-out <check_out>
    Then I see "Those dates overlap an existing reservation."

    Examples:
      | check_in      | check_out     |
      | July 8, 2027  | July 11, 2027 |
      | July 12, 2027 | July 15, 2027 |
      | July 11, 2027 | July 12, 2027 |
      | July 9, 2027  | July 14, 2027 |

  Scenario: A cancelled stay does not hold its dates
    Given I am signed in as an approved member
    And a stay from July 10, 2027 to July 13, 2027 was cancelled
    When I book check-in July 10, 2027 and check-out July 13, 2027
    Then the booking is allowed

  Scenario: Stays cannot overlap blocked dates
    Given I am signed in as an approved member
    And the cabin is blocked for the nights of August 10 to August 12, 2027
    When I try to book check-in August 11, 2027 and check-out August 12, 2027
    Then I see "Those dates are blocked and unavailable."
    And the stay cannot be confirmed

  Scenario: Arriving the day a blocked period ends is allowed without a warning
    Given I am signed in as an approved member
    And the cabin is blocked for the nights of August 10 to August 12, 2027
    When I book check-in August 13, 2027 and check-out August 15, 2027
    Then the booking is allowed
    And I see no turnover warning

  Scenario Outline: Same-day turnover with another member is allowed but flagged
    Given I am signed in as an approved member
    And Carol has a stay from July 10, 2027 to July 13, 2027
    When I choose check-in <check_in> and check-out <check_out>
    Then I see "<warning> You can still book it — coordinate arrival and departure with Carol."
    And I can still confirm the booking

    Examples:
      | check_in      | check_out     | warning                                                    |
      | July 13, 2027 | July 15, 2027 | Your check-in is the same day another stay checks out.     |
      | July 7, 2027  | July 10, 2027 | Your check-out is the same day another stay checks in.     |

  Scenario: No turnover warning next to my own stay
    Given I am signed in as an approved member
    And I have a stay from July 10, 2027 to July 13, 2027
    When I choose check-in July 13, 2027 and check-out July 15, 2027
    Then I see no turnover warning
    And I can confirm the booking

  Scenario Outline: Admins are exempt from the past-date rule only
    Given I am signed in as a reservations admin
    When I try to book <stay>
    Then I see "<message>"

    Examples:
      | stay                                                    | message                                                                                      |
      | a stay starting January 1, 2031                         | Reservations cannot start after 2030-12-31. That date range isn't open yet.                  |
      | a 15-night stay starting July 1, 2027                   | Reservations cannot exceed 14 consecutive nights.                                            |
      | dates overlapping another member's confirmed stay       | Those dates overlap an existing reservation.                                                 |

  Scenario: Rules are enforced even outside the booking screens
    Given I am signed in as an approved member
    When I try to book dates that overlap another member's stay without using the booking screens
    Then my booking is refused and nothing is saved
```

## Open Questions

- **[high]** "Today" is worked out in UTC on both the device and the server. In US evenings (from about 7–8 pm Eastern), "today" has already rolled over to tomorrow. A member booking tonight (check-out tomorrow) is refused with "New reservations can't be entirely in the past." The same drift affects "In progress" on My reservations and past/upcoming on the summary. Should "today" follow the cabin's local time zone? (`apps/mfr/lib/reservations/rules/dateHelpers.ts:28-33`)
- **[medium]** The horizon rule checks only the check-in date. A stay can start on the horizon and run up to 14 nights past it, even though the settings label reads "no reservations past this date". Should the check-out also be limited? (`apps/mfr/lib/reservations/rules/validateReservation.ts:105-111`)
- **[medium]** A member can book two back-to-back stays of their own (e.g. 14 nights + 14 nights), which gets around the maximum-stay limit. Their own adjacent stays raise no warning. Should the maximum apply to adjoining stays by the same person? (`apps/mfr/lib/reservations/rules/validateReservation.ts:113-120, 172-173`)

## Related Features

- CAP-020 Book a stay — the booking dialog applies these rules as I type
- CAP-024 Change or cancel a reservation — date changes are re-checked against these rules
- CAP-025 Manage all reservations — admin bookings for members, and the past-date exemption
- CAP-027 Booking rules settings — where the horizon and night limits are set
- CAP-026 Blocked dates — blocked dates can't be booked

## Code References

- `apps/mfr/lib/reservations/rules/validateReservation.ts:71-195` — the rules engine, its order and messages
- `apps/mfr/lib/reservations/rules/dateHelpers.ts` — night counting, overlap, year bucketing, today
- `apps/mfr/app/reservations/api/reservations/route.ts:110-146` — server-side check on create (owner's cap, admin flag)
- `apps/mfr/app/reservations/api/reservations/[id]/route.ts:57-91` — server-side check on change
- `apps/mfr/app/reservations/(app)/calendar/BookingPanel.tsx:69-203` — live check and turnover warning text
- `apps/mfr/lib/db/push-only.sql` — database overlap and blocked-date backstops
- `apps/mfr/lib/reservations/rules/validateReservation.test.ts` — boundary tests
- `e2e/global-setup.ts:86-87` — example rule values (horizon 2030-12-31, 14, 60)

## Change Log

- 2026-09-26 — Recovered from code.
