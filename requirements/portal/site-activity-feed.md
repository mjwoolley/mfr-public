---
id: CAP-009
title: Site activity feed
area: portal
status: implemented
source: recovered
related: [CAP-002, CAP-004, CAP-005, CAP-018, CAP-020, CAP-024, CAP-026, CAP-027]
---

# Site activity feed

```gherkin
Feature: Site activity feed
  Admins see an audit trail of sign-ups, bookings, blocked dates and rule changes
  Capability: CAP-009

  Scenario Outline: Only site owners and managers see the activity feed
    Given I am an approved <role>
    When I open the Activity tab in Admin
    Then <outcome>

    Examples:
      | role                | outcome                            |
      | site owner          | I see the site activity            |
      | site manager        | I see the site activity            |
      | accounting manager  | I am taken back to the home page   |
      | member with no role | I am taken back to the home page   |

  Scenario: Newest activity first, 30 at a time
    Given there are more than 30 activity entries
    When I open the Activity tab
    Then I see the 30 most recent entries, newest first, each with its date and time
    And I am offered "Load more" to see the next 30

  Scenario Outline: Each kind of activity reads as a sentence
    Given "Ann" <did something>
    When I open the Activity tab
    Then I see "<message>"

    Examples:
      | did something                                                         | message                                                                                                          |
      | signed up                                                             | Ann signed up.                                                                                                   |
      | signed up and matched a shareholder email                             | Ann signed up and was approved automatically.                                                                    |
      | booked 2026-07-01 to 2026-07-05                                       | Ann booked 2026-07-01 → 2026-07-05.                                                                              |
      | moved her own stay from 2026-07-01–05 to 2026-07-02–06                | Ann changed their reservation from 2026-07-01 → 2026-07-05 to 2026-07-02 → 2026-07-06.                            |
      | cancelled Bob's stay for 2026-07-01 to 2026-07-05                     | Ann cancelled Bob's reservation for 2026-07-01 → 2026-07-05.                                                     |
      | blocked off 2026-09-10 to 2026-09-12 for "Dock repair"                | Ann blocked off 2026-09-10 → 2026-09-12 (Dock repair).                                                           |
      | removed the blocked dates 2026-09-10 to 2026-09-12                    | Ann removed the blocked dates 2026-09-10 → 2026-09-12.                                                           |
      | changed the booking rules                                             | Ann updated the booking rules (horizon: 2027-06-30, max consecutive nights: 14, max nights/year: 30).            |

  Scenario: People who no longer have an account are still shown
    Given an entry was made by someone whose account no longer exists
    When I open the Activity tab
    Then the entry names them as "A former member"

  Scenario: Photo activity and the automated test account are left out
    Given members have uploaded photos and the automated site check has used the site
    When I open the Activity tab
    Then I see none of the photo entries or the automated check's entries
    And I am told photo activity lives on Photos → History and accounting activity under Accounting → Admin

  Scenario: No activity yet
    Given nothing has happened on the site
    When I open the Activity tab
    Then I see "No activity yet."

  Scenario: The feed fails to load
    Given the activity cannot be loaded right now
    When I open the Activity tab
    Then I see "Failed to load activity."
```

## Open Questions

- **[medium]** Approvals, blocks and role changes never appear in the feed. It has wording ready for "Ann approved Bob." and "Ann blocked Bob.", but nothing records those events. Should account decisions be part of the audit trail? (`apps/mfr/lib/reservations/activity/formatMessage.ts:44-48`, `apps/mfr/app/admin/users/actions.ts`)
- **[low]** Dates in feed sentences show as raw "2026-07-01" rather than the friendly dates used elsewhere, and the intro says "Everything members have done across the site" though photo and accounting activity are excluded. (`apps/mfr/lib/reservations/activity/formatMessage.ts:50-69`, `apps/mfr/app/admin/activity/page.tsx:13-15`)

## Related Features

- CAP-002 New sign-up handling — writes the sign-up and auto-approval entries
- CAP-004 Admin roles — site owners and managers may see the feed
- CAP-018 Photo history — where photo activity is shown instead
- CAP-020 Book a stay — writes booking entries
- CAP-024 Change or cancel a reservation — writes change and cancel entries
- CAP-026 Blocked dates — writes blocked-date entries
- CAP-027 Booking rules settings — writes rule-change entries
- CAP-005 User management — approvals, blocks and role changes and the activity feed

## Code References

- `apps/mfr/app/admin/activity/page.tsx`, `apps/mfr/app/admin/activity/ActivityClient.tsx` — tab, paging, empty and error states
- `apps/mfr/app/api/admin/activity/route.ts` — admin check, 30 per page, photo and smoke-user exclusion
- `apps/mfr/lib/reservations/activity/formatMessage.ts` — sentences for each entry type
- `e2e/tests/web.spec.ts:165-187`

## Change Log

- 2026-09-26 — Recovered from code.
