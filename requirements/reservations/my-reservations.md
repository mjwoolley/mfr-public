---
id: CAP-023
title: My reservations
area: reservations
status: implemented
source: recovered
related: [CAP-022, CAP-024]
---

# My reservations

```gherkin
Feature: My reservations
  A member sees and manages their current and upcoming stays.
  Capability: CAP-023

  Background:
    Given I am signed in as an approved member
    And today is March 10, 2027

  Scenario: My stays that have not ended are listed soonest first
    Given I have stays from July 10, 2027 to July 13, 2027 and from April 2, 2027 to April 4, 2027
    When I open "My Reservations"
    Then I see the heading "My reservations"
    And I see "Apr 2 → Apr 4" with "2 nights" and then "Jul 10 → Jul 13" with "3 nights"

  Scenario Outline: Each stay is marked in progress or upcoming
    Given I have a stay from <check_in> to <check_out>
    When I open "My Reservations"
    Then that stay is tagged "<tag>"

    Examples:
      | check_in       | check_out      | tag         |
      | March 8, 2027  | March 12, 2027 | In progress |
      | March 10, 2027 | March 12, 2027 | In progress |
      | March 11, 2027 | March 13, 2027 | Upcoming    |

  Scenario: Only my current and future confirmed stays are listed
    Given I have a stay that checked out on March 10, 2027
    And I have a cancelled stay in July 2027
    And another member has a stay in May 2027
    When I open "My Reservations"
    Then none of those stays are listed

  Scenario: No current or upcoming stays
    Given I have no confirmed stays that end after today
    When I open "My Reservations"
    Then I see "No reservations yet. Pick your dates on the calendar to book the cabin."

  Scenario: I can book from My reservations
    When I press "New reservation" on My reservations
    Then the booking dialog opens with check-in March 10, 2027 and check-out March 12, 2027

  Scenario: I can open, change or cancel a listed stay
    Given I have a stay from July 10, 2027 to July 13, 2027
    When I open "My Reservations"
    Then that stay offers "Edit" and "Cancel"
    And pressing the stay itself shows its details

  Scenario: The list fails to load
    Given my reservations cannot be loaded
    When I open "My Reservations"
    Then I see "Failed to load your reservations."
```

## Open Questions

- **[medium]** My reservations shows no past stays and no count of nights used or left against the yearly limit. The page's own code comment says it should show both. A member with only past stays sees "No reservations yet." Should the page show this year's history and the nights remaining? (`apps/mfr/app/reservations/(app)/my-reservations/MyReservationsClient.tsx:3-4, 43-45, 98`)
- **[low]** When booking rules haven't been set up, this page shows "Failed to load your reservations." rather than explaining that the calendar isn't set up yet. (`apps/mfr/app/reservations/(app)/my-reservations/MyReservationsClient.tsx:34-39`)

## Related Features

- CAP-022 Cabin calendar — shares the same stays, booking dialog and stay details
- CAP-024 Change or cancel a reservation — what "Edit" and "Cancel" do

## Code References

- `apps/mfr/app/reservations/(app)/my-reservations/MyReservationsClient.tsx:26-200` — list filter, tags, empty state, actions
- `apps/mfr/app/reservations/(app)/calendar/formatDates.ts` — "Jul 10 → Jul 13" and night labels
- `e2e/tests/reservations.spec.ts:44-63` — booked stay is listed
- `e2e/tests/reservations-lifecycle.spec.ts:23-54` — create, edit, cancel from this page

## Change Log

- 2026-09-26 — Recovered from code.
