---
id: CAP-015
title: Photo details
area: photos
status: implemented
source: recovered
related: [CAP-004, CAP-013, CAP-017, CAP-018]
---

# Photo details

```gherkin
Feature: Photo details
  View a photo large; the owner or a content admin fixes its year or caption.
  Capability: CAP-015

  Scenario: Any member can open a photo large
    Given I am signed in as an approved member
    When I click a photo in the albums
    Then I see the whole photo enlarged
    And I see its year, file name, dimensions and file size
    And I see its caption if it has one

  Scenario: Closing the enlarged photo
    Given I am viewing a photo enlarged
    When I choose "Close" or click outside the photo
    Then I am back at the albums

  Scenario: I can only look at another member's photo
    Given I am signed in as a member who is not a content admin
    When I open a photo another member added
    Then I see only "Close"
    And I do not see "Edit", "Delete" or "Feature on home"

  Scenario: The owner sees their photo's controls
    Given I am signed in as an approved member
    When I open a photo I added
    Then I see "Feature on home", "Edit", "Delete" and "Close"

  Scenario: The owner fixes a photo's year and caption
    Given I am viewing a photo I added from 2026
    When I choose "Edit"
    And I change the year to 2025 and the caption to "Grandma's 90th"
    And I choose "Save changes"
    Then the photo shows under 2025 with the caption "Grandma's 90th"

  Scenario: A content admin can fix any member's photo
    # Content admins are site owners and site managers (CAP-004).
    Given I am signed in as a content admin
    When I open a photo another member added
    Then I can edit its year and caption and delete it

  Scenario Outline: The year must be between 1900 and 2200
    Given I am editing a photo I added
    When I save the year <year>
    Then <outcome>
    Examples:
      | year | outcome                                   |
      | 1899 | I see "Invalid changes" and nothing is saved |
      | 1900 | the change is saved                       |
      | 2200 | the change is saved                       |
      | 2201 | I see "Invalid changes" and nothing is saved |

  Scenario Outline: A caption can be up to 500 characters
    Given I am editing a photo I added
    When I save a caption of <length> characters
    Then <outcome>
    Examples:
      | length | outcome                                   |
      | 500    | the change is saved                       |
      | 501    | I see "Invalid changes" and nothing is saved |

  Scenario: Clearing a caption removes it
    Given I am editing a photo that has a caption
    When I empty the caption and choose "Save changes"
    Then the photo no longer shows a caption

  Scenario: I cannot change another member's photo by going around the screens
    Given I am signed in as a member who is not a content admin
    When I try to change the caption of another member's photo without using the photo screens
    Then I am told "Not your photo"
    And nothing is saved

  Scenario: Editing a photo that was just deleted
    Given I am editing a photo
    And another person deletes it before I save
    When I choose "Save changes"
    Then I see "Photo not found"

  Scenario: Cancelling an edit keeps the photo unchanged
    Given I am editing a photo I added
    When I choose "Cancel edit"
    Then the year and caption are unchanged

  Scenario: A caption change is recorded in history
    Given I am viewing a photo I added from 2026
    When I change its caption to "Dock jump"
    Then the photo history shows that I captioned a 2026 photo "Dock jump"
```

## Open Questions

- **[medium]** Only caption changes are recorded in history. A year change leaves no trace, even when a content admin moves someone else's photo (`apps/mfr/app/photos/actions.ts:203-210`). Should year changes be recorded too?
- **[low]** The enlarged view has no previous/next navigation and doesn't close with the Escape key, so members must close it and reopen the next photo (`apps/mfr/app/photos/PhotoGallery.tsx:400-512`). Is that acceptable?

## Related Features

- CAP-004 Admin roles — content admins (site owner, site manager) can edit anyone's photo
- CAP-013 Photo albums — photos open from the album grid
- CAP-017 Featured photos — the Feature / Unfeature button lives in the enlarged view
- CAP-018 Photo history — caption changes are recorded

## Code References

- `apps/mfr/app/photos/PhotoGallery.tsx:136-146, 400-558` — enlarged view, controls, edit form
- `apps/mfr/app/photos/actions.ts:176-214` — updatePhoto: validation, owner-or-admin, history
- `apps/mfr/app/photos/PhotoGallery.test.tsx:137-166`, `apps/mfr/tests/photos-integration/gallery.test.ts:296-315, 436-446`

## Change Log

- 2026-09-26 — Recovered from code.
