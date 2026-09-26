---
id: CAP-026
title: Blocked dates
area: reservations
status: implemented
source: recovered
related: [CAP-004, CAP-009, CAP-021, CAP-022]
---

# Blocked dates

```gherkin
Feature: Blocked dates
  Admins close the cabin for date ranges.
  Capability: CAP-026

  Scenario: The page explains what blocking does
    Given I am signed in as a reservations admin
    When I open "Blocked Dates" in the reservations Admin area
    Then I see "Block off dates the cabin is unavailable — these can't be booked."
    And I see "Start date", "End date" and "Reason (optional)"

  Scenario: I block a period with a reason
    Given I am signed in as a reservations admin on "Blocked Dates"
    When I enter a start date of October 1, 2027 and an end date of October 10, 2027
    And I enter the reason "Dock maintenance"
    And I press "Block these dates"
    Then I see "Oct 1 → Oct 10" with "Dock maintenance" in the list
    And the form is cleared
    And members see those days as "Blocked" on the cabin calendar
    And the block appears in the site activity feed

  Scenario: A reason is optional
    Given I am signed in as a reservations admin on "Blocked Dates"
    When I block October 1, 2027 to October 10, 2027 without a reason
    Then the block is saved and listed without a reason

  Scenario Outline: The end date must be after the start date
    Given I am signed in as a reservations admin on "Blocked Dates"
    When I enter a start date of October 10, 2027 and an end date of <end>
    And I press "Block these dates"
    Then I see "endDate must be after startDate"
    And nothing is blocked

    Examples:
      | end              |
      | October 10, 2027 |
      | October 9, 2027  |

  Scenario: I cannot block dates someone has already booked
    Given I am signed in as a reservations admin on "Blocked Dates"
    And Carol has a stay from October 5, 2027 to October 8, 2027
    When I try to block October 1, 2027 to October 10, 2027
    Then I see "Those dates overlap an existing reservation."
    And nothing is blocked
    And I can move or cancel Carol's stay under "All Reservations" and try again

  Scenario: I remove a block
    Given I am signed in as a reservations admin on "Blocked Dates"
    And October 1, 2027 to October 10, 2027 is blocked
    When I press "Remove" on that block
    Then it disappears from the list
    And members can book those dates again
    And the removal appears in the site activity feed

  Scenario: Members cannot manage blocked dates
    Given I am signed in as an approved member without an admin role
    When I try to add or remove a block without using the admin screens
    Then my change is refused and nothing is saved

  Scenario: The list fails to load
    Given I am signed in as a reservations admin
    And the blocked dates cannot be loaded
    When I open "Blocked Dates"
    Then I see "Failed to load blocked dates."
```

## Open Questions

- **[high]** The "End date" of a block is not blocked: a block of October 1 to October 10 closes the nights of October 1–9, and October 10 stays bookable as a check-in. The form doesn't say this. Blocking a single day needs an end date of the next day, because the same day is refused with "endDate must be after startDate". Should the end date be inclusive, or at least be relabelled (e.g. "First day open again")? (`apps/mfr/app/reservations/(app)/admin/(reservations-admin)/blocked-dates/BlockedDatesClient.tsx:100-108`; `apps/mfr/lib/db/push-only.sql:13-29`)
- **[medium]** Every approved member can see block reasons. The calendar only shows "Blocked", but the reason is loaded with it. Could admins write private notes there? Related tidy-up: blocks may overlap each other, past blocks are never cleared out, and an empty list shows nothing at all. (`apps/mfr/app/reservations/api/blocked-dates/route.ts`; `apps/mfr/app/reservations/api/admin/blocked-dates/route.ts:21-67`)
- **[low]** The error "endDate must be after startDate" is written in developer terms, and the block's reason is missing from the site activity feed entry because it is not recorded with it. (`apps/mfr/app/reservations/api/admin/blocked-dates/route.ts:32-34, 51`)

## Related Features

- CAP-004 Admin roles — who may manage blocked dates
- CAP-009 Site activity feed — blocks and removals are recorded there
- CAP-022 Cabin calendar — blocked days are greyed and can't be picked
- CAP-021 Booking limits — blocked dates can't be booked

## Code References

- `apps/mfr/app/reservations/(app)/admin/(reservations-admin)/blocked-dates/BlockedDatesClient.tsx` — form, list, remove
- `apps/mfr/app/reservations/api/admin/blocked-dates/route.ts` — create, order check, overlap-with-stay error
- `apps/mfr/app/reservations/api/admin/blocked-dates/[id]/route.ts` — remove with activity entry
- `apps/mfr/app/reservations/api/blocked-dates/route.ts` — member read (includes reason)
- `apps/mfr/lib/db/push-only.sql:31-45` — block may not overlap a confirmed stay
- `e2e/tests/reservations-lifecycle.spec.ts:102-130` — block rejects member bookings
- `apps/mfr/tests/reservations-integration/memberRoutes.test.ts:238-300`, `admin.test.ts:78` — admin block tests

## Change Log

- 2026-09-26 — Recovered from code.
