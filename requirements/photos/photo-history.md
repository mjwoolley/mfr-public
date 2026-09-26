---
id: CAP-018
title: Photo history
area: photos
status: implemented
source: recovered
related: [CAP-009, CAP-014, CAP-015, CAP-016, CAP-017]
---

# Photo history

```gherkin
Feature: Photo history
  Who added, deleted, captioned or featured photos.
  Capability: CAP-018

  Background:
    Given I am signed in as an approved member

  Scenario Outline: Each kind of photo change reads as a sentence
    Given Jane Miller <action>
    When I open "History" in the Photos section
    Then I see "<sentence>"
    Examples:
      | action                                        | sentence                                              |
      | added a photo from 2026                       | Jane Miller added a 2026 photo.                       |
      | deleted a photo from 2026                     | Jane Miller deleted a 2026 photo.                     |
      | captioned a 2026 photo "Dock jump"            | Jane Miller captioned a 2026 photo: “Dock jump”.      |
      | cleared the caption on a 2026 photo           | Jane Miller edited the caption on a 2026 photo.       |
      | featured a 2026 photo                         | Jane Miller featured a 2026 photo on the home page.   |
      | unfeatured a 2026 photo                       | Jane Miller unfeatured a 2026 photo.                  |

  Scenario: Newest changes come first, up to the latest 100
    Given there have been 120 photo changes
    When I open "History" in the Photos section
    Then I see the 100 most recent changes, newest first

  Scenario: Times are shown in my own time zone
    Given a photo was added at 8:00 in the morning UTC
    And my device is set to US Eastern time
    When I open "History" in the Photos section
    Then that change shows as 4:00 in the morning

  Scenario: A change by someone no longer known shows as a former member
    Given a photo was added by a person who is no longer a member
    When I open "History" in the Photos section
    Then that change reads "A former member added a 2026 photo."

  Scenario: No photo changes yet
    Given nobody has changed any photos
    When I open "History" in the Photos section
    Then I see "Nothing yet — photo changes will show up here."

  Scenario: The page explains what it lists
    When I open "History" in the Photos section
    Then I see "Who added, removed, captioned, or featured photos."

  Scenario: Photo changes are kept out of the admin activity feed
    # The admin feed is specified in CAP-009.
    Given a member has added a photo
    When a site admin opens the site activity feed
    Then the photo change is not listed there

  Scenario: A problem recording history never blocks the photo change
    Given the history cannot be recorded for a moment
    When I add a photo
    Then the photo is still added
```

## Open Questions

- **[medium]** A member who has no display name shows as "A former member" in history, even though they are still a member and the albums show them by their email name (`apps/mfr/lib/photos/formatHistory.ts:16-20`, `apps/mfr/lib/photos/history.ts:44-45`, compare `apps/mfr/lib/photos/gallery.ts:115`). The avatar initial also falls back to "S" (`apps/mfr/app/photos/history/page.tsx:45`). Should history use the same name fallback as the albums?
- **[low]** Year changes and content-admin moderation edits to someone else's photo aren't distinguished, and year changes aren't recorded at all (see CAP-015). Should history say when an admin acted on another member's photo?

## Related Features

- CAP-009 Site activity feed — photo events are deliberately excluded from the admin feed
- CAP-014 Add photos — uploads are recorded
- CAP-015 Photo details — caption changes are recorded
- CAP-016 Delete photos — deletions are recorded
- CAP-017 Featured photos — feature and unfeature are recorded

## Code References

- `apps/mfr/app/photos/history/page.tsx` — History page and empty state
- `apps/mfr/app/photos/history/LocalTime.tsx` — viewer-local timestamps
- `apps/mfr/lib/photos/history.ts:15-49` — newest 100 photo events and names
- `apps/mfr/lib/photos/formatHistory.ts:16-52` — sentences and name fallbacks
- `apps/mfr/lib/photos/logPhotoActivity.ts:14-43` — event types; best-effort logging
- `apps/mfr/app/api/admin/activity/route.ts:16-24` — photo events excluded from the admin feed
- `apps/mfr/lib/photos/formatHistory.test.ts`, `apps/mfr/tests/photos-integration/gallery.test.ts:454-560`

## Change Log

- 2026-09-26 — Recovered from code.
