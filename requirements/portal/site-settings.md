---
id: CAP-008
title: Site settings
area: portal
status: implemented
source: recovered
related: [CAP-004, CAP-006, CAP-011, CAP-012, CAP-014]
---

# Site settings

```gherkin
Feature: Site settings
  Admins set reunion dates, family links and upcoming events
  Capability: CAP-008

  Scenario Outline: Only site owners and managers reach site settings
    Given I am an approved <role>
    When I open Admin
    Then <outcome>

    Examples:
      | role                | outcome                                        |
      | site owner          | I see "Site settings." on the Schedule tab     |
      | site manager        | I see "Site settings." on the Schedule tab     |
      | accounting manager  | I am taken back to the home page               |
      | member with no role | I am taken back to the home page               |

  Scenario: The admin area's tabs
    Given I am a site manager
    When I open Admin
    Then I see the tabs "Schedule", "Links", "Events", "Users" and "Activity"

  Scenario: Setting the reunion dates previews the meal slots
    Given I am on the Schedule tab
    When I set the first day to July 1 and the last day to July 5
    Then I see "5 days · 10 meal slots"
    And a tag for each of the five days

  Scenario: An incomplete or backwards date range builds no days
    Given I am on the Schedule tab
    When the last day is before the first day, or either is blank
    Then I see "Set a valid date range"

  Scenario: The reunion is capped at 21 days
    Given I am on the Schedule tab
    When I set a range longer than 21 days
    Then only the first 21 days get meal slots

  Scenario Outline: The reunion year must be between 2000 and 2100
    Given I am on the Schedule tab
    When I save the year <year>
    Then the schedule is <result>

    Examples:
      | year | result  |
      | 1999 | refused |
      | 2000 | saved   |
      | 2100 | saved   |
      | 2101 | refused |

  Scenario: Saving family links
    Given I am on the Links tab
    When I enter the Drive documents folder, Family Venmo and Family Chat space links
    And I choose "Save links"
    Then Documents reads from that folder, the home page offers that Venmo link and the nav's Family Chat opens that space

  Scenario: Adding and editing an event
    Given I am on the Events tab
    When I choose "Add an event"
    And I fill in a start date, a description and a Zoom or Teams link
    Then each field is saved as I move out of it
    And the event appears in "Upcoming events" on the home page

  Scenario: A multi-day event has no time
    Given I am editing an event
    When I set an end date as well as a start date
    Then the time field is cleared and unavailable with "Single day only"

  Scenario: An event cannot end before it starts
    Given I am editing an event
    When I set an end date before its start date
    Then I am told "End date must be on or after the start date."
    And the event is not changed

  Scenario: Removing an event
    Given I am on the Events tab
    When I choose the remove button on an event
    Then the event disappears from the Events tab and the home page

  Scenario: Members cannot change settings behind the screens
    Given I am an approved member with no admin role
    When I try to change the schedule, links or events without using the admin screens
    Then nothing is saved
```

## Open Questions

- **[medium]** Link fields accept any text with no check that it is a web address, and the values are shown to members as clickable links, including call links on events. Should links be required to start with "https://"? (`apps/mfr/app/admin/actions.ts:54-71,82-89`)
- **[low]** Saving the schedule or links gives no "Saved" confirmation, and removing an event happens with no confirmation step. (`apps/mfr/app/admin/AdminPanels.tsx:179-191,387-394`)

## Related Features

- CAP-004 Admin roles — site owners and managers hold this power
- CAP-006 Home page — shows the events and Venmo link set here
- CAP-011 Meal RSVPs — meal slots are built from the reunion dates set here
- CAP-012 Family documents — reads from the Drive folder set here
- CAP-014 Add photos — the reunion year set here is the year offered for new uploads

## Code References

- `apps/mfr/app/admin/layout.tsx`, `apps/mfr/app/admin/page.tsx`, `apps/mfr/app/admin/AdminSubNav.tsx` — gate, heading, tabs
- `apps/mfr/app/admin/AdminPanels.tsx` — schedule, links and events editors
- `apps/mfr/app/admin/actions.ts` — validation and saving
- `apps/mfr/lib/reunionDays.ts` — day list and 21-day cap
- `apps/mfr/tests/integration/portalContent.test.ts`, `apps/mfr/tests/integration/portalBranches.test.ts`, `e2e/tests/web.spec.ts:151-163`

## Change Log

- 2026-09-26 — Recovered from code.
