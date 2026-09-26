---
id: CAP-028
title: Reservations summary
area: reservations
status: implemented
source: recovered
related: [CAP-022]
---

# Reservations summary

```gherkin
Feature: Reservations summary
  Everyone's stays this year, grouped by person.
  Capability: CAP-028

  Background:
    Given I am signed in as an approved member
    And today is July 12, 2027

  Scenario: Each person's stays this year are grouped under their name
    Given Dave and Carol each have confirmed stays in 2027
    When I open "Reservations Summary"
    Then I see the heading "Reservations Summary"
    And I see a section for Carol followed by a section for Dave
    And each section shows that person's stays under "Upcoming" and "Past"

  Scenario: Each person's nights are totalled
    Given Carol has a 3-night stay that ended in May 2027 and a 5-night stay in August 2027
    When I open "Reservations Summary"
    Then Carol's section shows "5 upcoming · 3 past · 8 total nights"

  Scenario Outline: A stay is past once its check-out day has arrived
    Given Carol has a stay from <check_in> to <check_out>
    When I open "Reservations Summary"
    Then that stay is listed under "<column>"

    Examples:
      | check_in      | check_out     | column   |
      | July 8, 2027  | July 11, 2027 | Past     |
      | July 9, 2027  | July 12, 2027 | Past     |
      | July 10, 2027 | July 13, 2027 | Upcoming |
      | July 20, 2027 | July 22, 2027 | Upcoming |

  Scenario: Stays are ordered within each column
    Given Carol has past stays in March and May 2027 and upcoming stays in August and October 2027
    When I open "Reservations Summary"
    Then her upcoming stays run soonest first
    And her past stays run most recent first

  Scenario: Only confirmed stays that start this year are included
    Given Carol has a cancelled stay in August 2027
    And Carol has a stay from December 30, 2026 to January 3, 2027
    And Carol has a stay starting January 2, 2028
    When I open "Reservations Summary"
    Then none of those stays are listed

  Scenario: A person with nothing in one column
    Given Carol has only upcoming stays this year
    When I open "Reservations Summary"
    Then Carol's "Past" column shows "None"

  Scenario: Nobody has stays this year
    Given there are no confirmed stays starting in 2027
    When I open "Reservations Summary"
    Then I see "No reservations yet."

  Scenario: The summary fails to load
    Given the summary cannot be loaded
    When I open "Reservations Summary"
    Then I see "Failed to load reservation summary."
```

## Open Questions

- **[medium]** Only stays that start in the current calendar year appear. A stay running over New Year vanishes from the new year's summary, and on January 1 last year's history disappears completely. Should members be able to look at earlier years? (`apps/mfr/app/reservations/api/history/route.ts:14-47`)
- **[low]** Each stay line always says "nights", so a one-night stay reads "1 nights". (`apps/mfr/app/reservations/(app)/summary/SummaryClient.tsx:16`)

## Related Features

- CAP-022 Cabin calendar — the same stays shown by date instead of by person

## Code References

- `apps/mfr/app/reservations/(app)/summary/SummaryClient.tsx` — page, per-person totals, empty states
- `apps/mfr/app/reservations/(app)/summary/summaryGrouping.ts:38-77` — grouping, past vs upcoming, ordering
- `apps/mfr/app/reservations/api/history/route.ts` — confirmed stays starting this calendar year
- `apps/mfr/tests/reservations-integration/history.test.ts` — cancelled and other-year exclusion

## Change Log

- 2026-09-26 — Recovered from code.
