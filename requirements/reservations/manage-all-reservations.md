---
id: CAP-025
title: Manage all reservations
area: reservations
status: implemented
source: recovered
related: [CAP-004, CAP-020, CAP-021, CAP-024]
---

# Manage all reservations

```gherkin
Feature: Manage all reservations
  Admins view, create, edit and cancel anyone's stays.
  Capability: CAP-025

  # "Reservations admin" means a site owner or site manager (roles are
  # defined in CAP-004 Admin roles).

  Scenario: Reservations admins get an Admin tab
    Given I am signed in as a reservations admin
    When I open Reservations
    Then I see an "Admin" tab marked as admins only
    When I open it
    Then I see "All Reservations", "Blocked Dates" and "Booking Rules"
    And "All Reservations" is shown first

  Scenario: Members without an admin role cannot reach the Admin area
    Given I am signed in as an approved member without an admin role
    Then I do not see an "Admin" tab in Reservations
    When I go to the reservations Admin area anyway
    Then I am taken to the cabin calendar

  Scenario: All confirmed stays are listed in date order
    Given I am signed in as a reservations admin
    And Carol has a stay from July 10, 2027 to July 13, 2027
    And Dave has a stay from May 1, 2027 to May 3, 2027
    When I open "All Reservations"
    Then I see "View, edit, cancel, or create a reservation for any family member."
    And I see Dave's "May 1 → May 3" with "Dave · 2 nights" before Carol's "Jul 10 → Jul 13" with "Carol · 3 nights"

  Scenario: No stays to list
    Given I am signed in as a reservations admin
    And there are no confirmed stays
    When I open "All Reservations"
    Then I see "No reservations in range."

  Scenario: I must choose a member when booking on someone's behalf
    Given I am signed in as a reservations admin
    When I press "New reservation" on All Reservations
    Then the dialog opens with check-in today and check-out tomorrow
    And I see a "Member" list starting at "Select a member…"
    And I see "Choose a member to book for."
    And "Confirm reservation" is disabled until I choose a member

  Scenario: Only approved members can be chosen
    Given I am signed in as a reservations admin
    When I open the "Member" list
    Then it lists approved members by name
    And a member without a name is listed as "Unnamed member"

  Scenario: A booking made for a member belongs to that member
    Given I am signed in as a reservations admin
    When I book July 10, 2027 to July 13, 2027 for Carol
    Then the stay is confirmed as Carol's stay
    And it counts toward Carol's yearly limit, not mine
    And Carol is sent the booking confirmation email

  Scenario: I cannot book for someone who is not an approved member
    Given I am signed in as a reservations admin
    When I try to book for a person whose account is still pending approval
    Then I see "That member could not be found or is not approved."
    And no stay is saved

  Scenario: Members cannot book on someone else's behalf
    Given I am signed in as an approved member without an admin role
    When I try to book a stay for another member without using the booking screens
    Then my booking is refused and nothing is saved

  Scenario: I change a member's stay
    Given I am signed in as a reservations admin
    And Carol has a stay from July 10, 2027 to July 13, 2027
    When I press "Edit" on Carol's stay and change the check-out to July 14, 2027
    Then Carol's stay shows as "Jul 10 → Jul 14"
    And the new dates are checked against Carol's yearly limit
    And Carol is emailed that I changed her reservation

  Scenario: I cancel a member's stay
    Given I am signed in as a reservations admin
    And Carol has a stay from July 10, 2027 to July 13, 2027
    When I press "Cancel" on Carol's stay
    Then her stay disappears from the list
    And Carol is emailed that I cancelled her reservation

  Scenario: A failed cancellation is shown on that stay
    Given I am signed in as a reservations admin
    And Carol's stay cannot be cancelled right now
    When I press "Cancel" on Carol's stay
    Then I see why on that stay's row
    And her stay stays in the list
```

## Open Questions

- **[medium]** When an admin books for a member, the site activity feed reads "{admin} booked {dates}." and doesn't name the member, although the member is recorded. Carol's confirmation email doesn't say who booked it and has no reply-to address. Should bookings made for someone name both people? (`apps/mfr/lib/reservations/activity/formatMessage.ts:50-51`; `apps/mfr/app/reservations/api/reservations/route.ts:162-163`; `apps/mfr/lib/reservations/notifications.ts:95-121`)
- **[medium]** On the cabin calendar, an admin's stay details offer "Edit" and "Cancel reservation" only for their own stays, so managing someone else's stay means going to All Reservations. Should admins get these actions on the calendar too? (`apps/mfr/app/reservations/(app)/calendar/CalendarClient.tsx:341-349`)
- **[low]** The code describes this page as "upcoming stays", but it lists every confirmed stay from January 1 of last year onward, including finished ones. Should finished stays be hidden or split out? (`apps/mfr/app/reservations/(app)/admin/(reservations-admin)/reservations/AdminReservationsClient.tsx:3, 52-54`)

## Related Features

- CAP-004 Admin roles — who counts as a reservations admin
- CAP-020 Book a stay — the same booking dialog, plus a member picker
- CAP-021 Booking limits — all limits apply except the past-date rule; the cap is the member's
- CAP-024 Change or cancel a reservation — the owner-or-admin rule for changes and cancellations

## Code References

- `apps/mfr/app/reservations/(app)/NavBar.tsx:21, 50` — Admin tab for reservations admins
- `apps/mfr/app/reservations/(app)/admin/layout.tsx:15-17` — non-admins sent to the calendar
- `apps/mfr/app/reservations/(app)/admin/AdminSubNav.tsx`, `admin/page.tsx` — sections, lands on All Reservations
- `apps/mfr/app/reservations/(app)/admin/(reservations-admin)/reservations/AdminReservationsClient.tsx` — list, create for member, edit, cancel
- `apps/mfr/app/reservations/(app)/calendar/BookingPanel.tsx:62-67, 121-166` — member picker
- `apps/mfr/lib/users.ts:55-61` — approved members for the picker
- `apps/mfr/app/reservations/api/reservations/route.ts:88-108` — book-on-behalf checks
- `apps/mfr/tests/reservations-integration/reservations.test.ts:183-247` — on-behalf tests

## Change Log

- 2026-09-26 — Recovered from code.
