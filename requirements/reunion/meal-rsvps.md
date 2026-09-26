---
id: CAP-011
title: Meal RSVPs
area: reunion
status: implemented
source: recovered
related: [CAP-003, CAP-008]
---

# Meal RSVPs

```gherkin
Feature: Meal RSVPs
  Members mark which reunion meals they'll attend and see headcounts
  Capability: CAP-011

  Background:
    Given I am signed in as an approved member
    And the reunion runs from Saturday, July 1 to Wednesday, July 5

  Scenario: Every reunion day has a lunch and a dinner
    When I open Meals
    Then I see "Who's here for which meals?"
    And the header shows the reunion week "Jul 1 – Jul 5" and the reunion year
    And "Your meals" lists each of the 5 days with a "Lunch" and a "Dinner" button

  Scenario: Marking a meal
    Given I have no meals marked
    When I choose "Lunch" on Jul 1
    Then it shows "✓ Lunch" straight away
    And I see "1 meal marked"
    And it is still marked after I reload the page

  Scenario: Unmarking a meal
    Given I have marked lunch on Jul 1
    When I choose "✓ Lunch" on Jul 1
    Then it shows "Lunch" again and I am no longer counted for it

  Scenario: I can only mark my own meals
    When I mark a meal
    Then only my own attendance changes
    And I have no way to mark meals for anyone else

  Scenario: Each day shows its headcount and who is coming
    Given Ann and Bob have marked dinner on Jul 2
    And nobody has marked lunch on Jul 2
    When I open Meals
    Then Jul 2 shows Dinner 2 with "Ann, Bob"
    And Jul 2 shows Lunch 0 with "No one yet"

  Scenario: The biggest meal is called out
    Given dinner on Jul 2 has the most people at 12
    When I open Meals
    Then "Biggest meal so far" shows "Sun Jul 2 dinner · 12 people"

  Scenario: Ties go to the earliest meal
    Given lunch on Jul 1 and dinner on Jul 3 each have 8 people and no meal has more
    When I open Meals
    Then "Biggest meal so far" names lunch on Jul 1

  Scenario: The family grid shows everyone with access
    When I open Meals
    Then "Everyone's meals" lists every approved member sorted by last name
    And shows a lunch and a dinner dot for each day
    And my own row is highlighted and marked "(you)"

  Scenario: Pending and blocked people are not on the roster
    Given someone's account is awaiting approval or blocked
    When I open Meals
    Then they do not appear in the grid or the headcounts

  Scenario: Reunion dates not set
    Given the reunion dates have not been set
    When I open Meals
    Then I see "The reunion dates aren't set yet — check back once Admin adds them."
    And the week shows "Dates to be set"
    And "Biggest meal so far" shows "Nothing planned yet"
```

## Open Questions

- **[high]** A meal mark is remembered as "day 3 lunch", not as a date or a reunion year. Moving the reunion dates shifts everyone's marks onto different days, and last year's marks carry straight into next year's reunion because nothing clears them. Should marks be tied to actual dates, and cleared or archived each year? (`apps/mfr/lib/db/schema/portal.ts:115-129`, `apps/mfr/lib/portal.ts:122-133`)
- **[medium]** The grid lists every approved login, including admins who aren't attending, and there is no way to mark meals for family members without their own login, such as children. Should members be able to RSVP for their household? (`apps/mfr/lib/portal.ts:74-95`)
- **[low]** If I unmark every meal, the "meals marked" count can briefly show my old total, and a mark that fails to save gives no message. (`apps/mfr/app/meals/MealsToggles.tsx:62-73`)

## Related Features

- CAP-003 Access for unapproved accounts — only approved members can open Meals
- CAP-008 Site settings — the reunion dates and year come from there

## Code References

- `apps/mfr/app/meals/page.tsx` — page, headcounts, peak, roster
- `apps/mfr/app/meals/MealsToggles.tsx` — own meal buttons, count, empty state
- `apps/mfr/app/meals/actions.ts` — toggling own attendance only
- `apps/mfr/lib/portal.ts:74-186` — roster (approved users, last-name sort), headcounts, peak with earliest-wins ties
- `apps/mfr/lib/reunionDays.ts` — day list
- `apps/mfr/tests/integration/portalContent.test.ts:152-200`, `e2e/tests/admin-edge.spec.ts:131-158`, `e2e/tests/web.spec.ts:137-149`

## Change Log

- 2026-09-26 — Recovered from code.
