---
id: CAP-006
title: Home page
area: portal
status: implemented
source: recovered
related: [CAP-003, CAP-007, CAP-008, CAP-017, CAP-041]
---

# Home page

```gherkin
Feature: Home page
  A public front door, plus the share goal, events and featured photos for signed-in members
  Capability: CAP-006

  Scenario: Anyone can read the family story
    Given I am not signed in
    When I open the home page
    Then I see "Lake Lure, North Carolina" and "Sixty summers on the lake."
    And I see the story of the Miller cabin

  # The hero slideshow (featured photos for members, the lake house picture
  # for everyone else) is specified in CAP-017 Featured photos.

  Scenario: Signed-out visitors are invited to sign in instead of seeing member content
    Given I am not signed in
    When I open the home page
    Then I see "There's more inside"
    And I see "Sign in to see this year's goal, upcoming events, meals, photos and documents."
    And I am offered "Sign in"
    But I do not see the share goal or upcoming events

  Scenario: Signed-in members see this year's share goal
    Given I am signed in
    When I open the home page
    Then I see this fiscal year's share goal with shares sold "of" the goal in shares
    And I can follow "Full ledger →" to Accounting
    And I am offered a "Venmo" button when the family Venmo link is set

  Scenario: No goal set yet
    Given I am signed in
    And no goal is set for this fiscal year
    When I open the home page
    Then the goal shows "—"
    And I see "Every share purchase keeps the cabin going."

  Scenario: The goal card disappears quietly when the figures can't be read
    Given I am signed in
    And the accounting figures cannot be read right now
    When I open the home page
    Then the page still loads without the share goal figures failing it

  Scenario: Signed-in members see upcoming events in date order
    Given I am signed in
    And an admin has added events
    When I open the home page
    Then I see "Upcoming events" listed by start date
    And a single-day event shows its weekday and time
    And a multi-day event shows its first and last date as a range
    And an event with a call link offers "Join"

  Scenario: Incomplete events still show
    Given I am signed in
    And an event has no description and no date
    When I open the home page
    Then it shows as "Untitled event" with "Date to be set"

  Scenario: No events yet
    Given I am signed in
    And there are no events
    When I open the home page
    Then I see "Nothing on the calendar yet."
```

## Open Questions

- **[high]** The member-only parts of the home page check only that someone is signed in, not that they are approved. A pending or blocked person therefore sees featured family photos, the share figures and event call links. Should these require an approved account like every other member page? (`apps/mfr/app/page.tsx:58-68,160,235`)
- **[medium]** "Upcoming events" shows every event ever added, including past ones, and a blank event appears to all members the moment an admin adds it. Should past events drop off and unfinished ones stay hidden? (`apps/mfr/lib/portal.ts:61-63`)
- **[low]** "Manage events" and the "Add an event" link are shown to every signed-in member, but non-admins who follow them are just returned to the home page. (`apps/mfr/app/page.tsx:239-252`)

## Related Features

- CAP-003 Access for unapproved accounts — the home page is the only page pending and blocked people still see
- CAP-007 Site navigation — the nav and sign-in link sit above the home page
- CAP-008 Site settings — admins manage the events, Venmo link and reunion year shown here
- CAP-017 Featured photos — specifies the home slideshow: featured photos for members, the lake house picture for everyone else
- CAP-041 Share purchase goal — the goal figures and progress wording

## Code References

- `apps/mfr/app/page.tsx` — hero, sign-in prompt, goal card, events
- `apps/mfr/app/HomeSlideshow.tsx` — slideshow
- `apps/mfr/lib/portal.ts:45-63` — share figures (degrade to hidden) and events
- `apps/mfr/app/page.test.tsx`, `e2e/tests/web.spec.ts:10-27`

## Change Log

- 2026-09-26 — Recovered from code.
