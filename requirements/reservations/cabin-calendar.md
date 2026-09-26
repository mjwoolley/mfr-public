---
id: CAP-022
title: Cabin calendar
area: reservations
status: implemented
source: recovered
related: [CAP-003, CAP-020, CAP-023, CAP-024, CAP-026, CAP-028]
---

# Cabin calendar

```gherkin
Feature: Cabin calendar
  Everyone sees who has the cabin when, as a month or list view.
  Capability: CAP-022

  Background:
    Given I am signed in as an approved member

  Scenario: Reservations open on the calendar for the current month
    Given today is March 10, 2027
    When I open Reservations
    Then I see the cabin calendar with the heading "March 2027"
    And I see the tabs "Calendar", "My Reservations" and "Reservations Summary"

  Scenario: I can move between months
    Given I am viewing "March 2027" on the cabin calendar
    When I press "Next month"
    Then I see "April 2027"
    When I press "Previous month"
    Then I see "March 2027"

  Scenario: The legend explains the colors
    When I open the cabin calendar
    Then I see a legend with "Available", "Your stay", "Booked by family" and "Turnover day"

  Scenario: My stays and family stays look different
    Given I have a stay from July 10, 2027 to July 13, 2027
    And Carol has a stay from July 20, 2027 to July 22, 2027
    When I view July 2027
    Then July 10 to July 13 are shown as my stay
    And July 20 to July 22 are shown as booked by family
    And "Carol" is shown on July 20

  Scenario: A turnover day shows both stays
    Given Carol's stay checks out on July 13, 2027
    And my stay checks in on July 13, 2027
    When I view July 2027
    Then July 13 is shown split between Carol's departure and my arrival

  Scenario: A check-out-only day can be picked as a check-in
    Given Carol's stay checks out on July 13, 2027
    And nobody is booked for the night of July 13, 2027
    When I click July 13, 2027
    Then it becomes my check-in date

  Scenario: Blocked days cannot be picked
    Given the cabin is blocked for the nights of August 10 to August 12, 2027
    When I view August 2027
    Then August 10, 11 and 12 are greyed out and labelled "Blocked"
    And I cannot click them

  Scenario: Days after the booking horizon cannot be picked
    Given the booking horizon is December 31, 2030
    When I view January 2031
    Then every day is greyed out
    And I cannot click them

  Scenario Outline: Opening a booked night shows the stay
    Given <owner> has a stay from July 10, 2027 to July 13, 2027
    When I click July 11, 2027
    Then I see the stay's details with "Jul 10 → Jul 13" and "3 nights"
    And I see the tag "<tag>"
    And the actions offered are <actions>

    Examples:
      | owner | tag       | actions                                     |
      | I     | Your stay | "Cancel reservation", "Edit" and "Close"    |
      | Carol | Family    | only "Close"                                |

  Scenario: List view shows the stays checking in this month
    Given stays check in on July 20, 2027 and July 5, 2027
    And a stay checks in on June 30, 2027 and checks out on July 3, 2027
    When I view July 2027 as "List"
    Then I see the July 5 stay and then the July 20 stay
    And I do not see the stay that checked in on June 30

  Scenario: List view when nobody checks in that month
    Given no stays check in during July 2027
    When I view July 2027 as "List"
    Then I see "The cabin is wide open this month. Switch to Month view and pick your dates."

  Scenario: Calendar that fails to load
    Given the calendar cannot be loaded
    When I open the cabin calendar
    Then I see "Failed to load the calendar. Please refresh."

  Scenario: The calendar picks up other people's changes when I come back to it
    Given I have the cabin calendar open
    And another member books a stay
    When I return to the calendar's browser tab
    Then I see their stay without reloading the page
```

## Open Questions

- **[medium]** The calendar only loads stays from January 1 of last year to December 31 of next year. I can page into later months up to the horizon, but stays there never appear, so booked dates look free until the server refuses the booking. My reservations and All Reservations have the same blind spot. Should the loaded range follow the horizon? (`apps/mfr/app/reservations/(app)/calendar/useCalendarData.ts:32-40`)
- **[low]** The first day of a blocked period is greyed and can't be clicked, even though checking out that morning is allowed. A member has to type that check-out date in the dialog instead. (`apps/mfr/app/reservations/(app)/calendar/CalendarGrid.tsx:109-111`)

## Related Features

- CAP-003 Access for unapproved accounts — pending and blocked people never reach the calendar
- CAP-020 Book a stay — dates are picked on the calendar
- CAP-023 My reservations — the member's own list uses the same data
- CAP-024 Change or cancel a reservation — Edit and Cancel from the stay's details
- CAP-026 Blocked dates — blocked periods appear greyed out
- CAP-028 Reservations summary — the per-person view of the same stays

## Code References

- `apps/mfr/app/reservations/(app)/NavBar.tsx:15-21` — reservations tabs
- `apps/mfr/app/reservations/page.tsx` — landing goes to the calendar
- `apps/mfr/app/reservations/(app)/calendar/CalendarClient.tsx:32-370` — month nav, legend, modes, dialogs
- `apps/mfr/app/reservations/(app)/calendar/CalendarGrid.tsx:101-177` — cell shading, turnover split, disabled days
- `apps/mfr/app/reservations/(app)/calendar/dayInfo.ts:28-54` — which stay occupies or checks out on a day
- `apps/mfr/app/reservations/(app)/calendar/ReservationViewDialog.tsx:24-93` — stay details and owner-only actions
- `apps/mfr/app/reservations/(app)/calendar/ListView.tsx`, `listGrouping.ts` — list mode
- `apps/mfr/app/reservations/(app)/calendar/useCalendarData.ts` — data window and refresh on focus
- `apps/mfr/app/reservations/api/reservations/route.ts:23-70` — confirmed stays with names
- `e2e/tests/reservations-lifecycle.spec.ts:132-148` — month navigation

## Change Log

- 2026-09-26 — Recovered from code.
