---
id: CAP-016
title: Delete photos
area: photos
status: implemented
source: recovered
related: [CAP-004, CAP-013, CAP-018, CAP-019]
---

# Delete photos

```gherkin
Feature: Delete photos
  The owner or a content admin removes one or many photos.
  Capability: CAP-016

  Scenario: The owner deletes one photo after confirming
    Given I am signed in as an approved member
    And I am viewing a photo I added
    When I choose "Delete"
    Then I am asked "Delete this photo? Its backup is kept for 30 days."
    And when I confirm, the photo disappears from the albums, the Featured page and the home slideshow

  Scenario: Declining the confirmation keeps the photo
    Given I am viewing a photo I added
    When I choose "Delete" and then decline
    Then the photo is still there

  Scenario: I can select several of my photos and delete them together
    Given I am signed in as an approved member
    When I select 3 of my photos in the albums
    Then I see "3 selected" with a "Delete" button
    And when I choose "Delete" I am asked "Delete 3 photos? Backups are kept for 30 days."
    And when I confirm, all 3 photos disappear

  Scenario: I can only select photos I am allowed to delete
    Given I am signed in as a member who is not a content admin
    When I view the albums
    Then only my own photos offer a select circle

  Scenario: Clearing a selection
    Given I have selected 2 photos
    When I choose "Clear selection"
    Then nothing is selected and the delete bar goes away

  Scenario: A content admin can delete any member's photos
    # Content admins are site owners and site managers (CAP-004).
    Given I am signed in as a content admin
    Then I can select and delete photos any member added

  Scenario: I cannot delete another member's photo by going around the screens
    Given I am signed in as a member who is not a content admin
    When I try to delete another member's photo without using the photo screens
    Then I am told "Not your photo"
    And the photo is not deleted

  Scenario: A bulk delete skips photos I may not delete
    Given I am signed in as a member who is not a content admin
    When I try to delete 2 of my photos and 1 of another member's together
    Then my 2 photos are deleted
    And the other member's photo is kept

  Scenario: A bulk delete where nothing can be deleted
    Given I am signed in as a member who is not a content admin
    When I try to delete only other members' photos together
    Then I see "Nothing was deleted."

  Scenario Outline: A bulk delete covers at most 500 photos
    Given I am signed in as a content admin
    When I delete <count> photos together
    Then <outcome>
    Examples:
      | count | outcome                                         |
      | 500   | they are deleted                                |
      | 501   | I see "Invalid selection" and nothing is deleted |

  Scenario: Deleting a photo that is already gone is harmless
    Given another person has just deleted a photo
    When I delete the same photo
    Then I see no error

  Scenario: Each deletion is recorded in history
    Given I am signed in as an approved member
    When I delete a 2026 photo I added
    Then the photo history shows that I deleted a 2026 photo
```

## Open Questions

- **[high]** Both confirmations promise "Backups are kept for 30 days". But a backup exists only where backups are switched on (production) and only if the copy succeeded, so a photo deleted before the nightly backup catches up has none. Restoring is also manual work for an operator; no member or admin can do it (`apps/mfr/app/photos/PhotoGallery.tsx:188, 479`, `apps/mfr/app/photos/actions.ts:227-231`). What should the confirmation promise, and who can ask for a restore?
- **[medium]** When a bulk delete skips photos the member may not delete, the member isn't told which were skipped (`apps/mfr/app/photos/actions.ts:256-278`). The screens only let members select their own photos, so this is reachable only around the screens or when permissions change mid-session. Should skipped photos be reported?

## Related Features

- CAP-004 Admin roles — content admins may delete anyone's photos (moderation)
- CAP-013 Photo albums — multi-select happens in the album grid
- CAP-018 Photo history — deletions are recorded
- CAP-019 Photo backup and recovery — the 30-day recovery window after deletion

## Code References

- `apps/mfr/app/photos/actions.ts:216-279` — deletePhoto / deletePhotos
- `apps/mfr/app/photos/PhotoGallery.tsx:140-142, 183-202, 245-269, 325-351, 472-487` — select circles, delete bar, confirmations
- `apps/mfr/tests/photos-integration/gallery.test.ts:316-383`, `apps/mfr/app/photos/PhotoGallery.test.tsx:92-111`

## Change Log

- 2026-09-26 — Recovered from code.
