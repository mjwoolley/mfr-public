---
id: CAP-027
title: Booking rules settings
area: reservations
status: implemented
source: recovered
related: [CAP-004, CAP-009, CAP-021]
---

# Booking rules settings

```gherkin
Feature: Booking rules settings
  Admins set the horizon and night limits.
  Capability: CAP-027

  Scenario: I see the current rules
    Given I am signed in as a reservations admin
    And the booking horizon is December 31, 2030, the maximum stay is 14 nights and the yearly limit is 60 nights
    When I open "Booking Rules" in the reservations Admin area
    Then I see "Set the booking horizon and per-person limits."
    And "Booking horizon — no reservations past this date" shows December 31, 2030
    And "Max consecutive nights per reservation" shows 14
    And "Max nights per person per calendar year" shows 60

  Scenario: I change the rules
    Given I am signed in as a reservations admin on "Booking Rules"
    When I set the maximum stay to 10 nights
    And I press "Save changes"
    Then I see "Saved."
    And the change appears in the site activity feed with the new horizon and limits

  Scenario: New rules apply to the next booking
    Given an admin has just lowered the maximum stay to 10 nights
    And I am signed in as an approved member
    When I try to book an 11-night stay
    Then I see "Reservations cannot exceed 10 consecutive nights."

  Scenario: Tightening a rule does not affect stays already booked
    Given a member has a confirmed 14-night stay
    When an admin lowers the maximum stay to 10 nights
    Then the member's 14-night stay stays confirmed and unchanged

  Scenario Outline: Night limits must be at least 1 on the form
    Given I am signed in as a reservations admin on "Booking Rules"
    When I enter <value> for "Max consecutive nights per reservation"
    And I press "Save changes"
    Then the form <outcome>

    Examples:
      | value | outcome                          |
      | 0     | will not submit                  |
      | 1     | saves and shows "Saved."         |

  Scenario: Members cannot change the booking rules
    Given I am signed in as an approved member without an admin role
    When I try to change the booking rules without using the admin screens
    Then my change is refused and nothing is saved

  Scenario: The rules fail to load
    Given I am signed in as a reservations admin
    And the booking rules cannot be loaded
    When I open "Booking Rules"
    Then I see "Failed to load booking rules."
```

## Open Questions

- **[high]** On a new environment with no rules saved yet, this page shows "Failed to load booking rules." and has no form. The calendar tells members to "configure booking rules under Admin → Booking Rules", which this page can't do, so the first-time setup can only happen outside the app. Separately, the server accepts any values it is sent (zero or negative limits, fractions, any horizon text); only the form's minimum of 1 protects it. Should the page offer first-time setup, and should the server reject bad values? (`apps/mfr/app/reservations/(app)/admin/(reservations-admin)/booking-rules/BookingRulesClient.tsx:27-36`; `apps/mfr/app/reservations/api/admin/booking-rules/route.ts:31-56`)
- **[medium]** The horizon label says "no reservations past this date", but the rule only stops stays that start after it (see CAP-021). Should the label or the rule change? (`apps/mfr/app/reservations/(app)/admin/(reservations-admin)/booking-rules/BookingRulesClient.tsx:82`)

## Related Features

- CAP-004 Admin roles — who may change the booking rules
- CAP-009 Site activity feed — rule changes are recorded with their new values
- CAP-021 Booking limits — how each setting is enforced

## Code References

- `apps/mfr/app/reservations/(app)/admin/(reservations-admin)/booking-rules/BookingRulesClient.tsx` — form, labels, "Saved."
- `apps/mfr/app/reservations/api/admin/booking-rules/route.ts` — partial update, first-time creation, activity entry
- `apps/mfr/app/reservations/api/booking-rules/route.ts` — members read the rules for live checks
- `apps/mfr/tests/reservations-integration/admin.test.ts:100-180` — update and bootstrap tests
- `e2e/tests/reservations.spec.ts:75-86` — non-admin refused

## Change Log

- 2026-09-26 — Recovered from code.
