---
id: CAP-017
title: Featured photos
area: photos
status: implemented
source: recovered
related: [CAP-004, CAP-006, CAP-013, CAP-015, CAP-018]
---

# Featured photos

```gherkin
Feature: Featured photos
  Members star up to 5 of their own photos for the Featured page and home slideshow.
  Capability: CAP-017

  Scenario: I feature one of my own photos
    Given I am signed in as an approved member
    When I tap the star on a photo I added
    Then the star shows the photo as "Featured on the home page"
    And the photo appears on the Featured page and in the home slideshow

  Scenario: I can also feature from the enlarged photo
    Given I am viewing a photo I added
    When I choose "Feature on home"
    Then the button changes to "Unfeature"

  Scenario Outline: Each member may feature up to 5 of their own photos
    Given I am signed in as an approved member
    And I already have <count> featured photos
    When I tap the star on another photo I added
    Then <outcome>
    Examples:
      | count | outcome                                                  |
      | 4     | it becomes featured                                      |
      | 5     | I see "You can feature up to 5 photos." and it stays unfeatured |

  Scenario: The limit message goes away on its own
    Given I have just seen "You can feature up to 5 photos."
    When a few seconds pass
    Then the message disappears

  Scenario: Other members' photos don't offer a star
    Given I am signed in as a member who is not a content admin
    When I view a photo another member added
    Then I cannot feature or unfeature it

  Scenario: I cannot feature someone else's photo by going around the screens
    Given I am signed in as an approved member
    When I try to feature another member's photo without using the photo screens
    Then I am told "You can only feature your own photos"
    And the photo is not featured

  Scenario: I unfeature one of my photos
    Given one of my photos is featured
    When I tap its star or choose "Unfeature"
    Then it leaves the Featured page and the home slideshow
    And it stays in the albums

  Scenario: A content admin can unfeature anyone's photo but not feature it
    # Moderation power of content admins (CAP-004).
    Given I am signed in as a content admin
    When I view another member's featured photo
    Then I can choose "Unfeature"
    But on another member's photo that is not featured I see no star

  Scenario: The Featured page lists every featured photo, most recently featured first
    Given I am signed in as an approved member
    And photos from several members are featured
    When I open "Featured" in the Photos section
    Then I see every featured photo, the most recently featured first
    And I see "The family’s picks. Tap the star on any photo to feature it on the home page."

  Scenario: No featured photos yet
    Given I am signed in as an approved member
    And no photos are featured
    When I open "Featured" in the Photos section
    Then I see "No featured photos yet. Tap the star on any photo in Albums to add it here."

  Scenario: Signed-in members see featured photos rotate on the home page
    Given I am signed in as an approved member
    And 3 photos are featured
    When I open the home page
    Then the slideshow crossfades through the 3 featured photos, a new one about every 5 seconds
    And each photo is shown whole, never cropped
    And I can jump to any of them using the dots below

  Scenario: The home slideshow falls back to the lake-house picture
    Given I am signed in as an approved member
    And no photos are featured
    When I open the home page
    Then I see the standard lake-house picture with no dots

  Scenario: Family photos are never shown to signed-out visitors
    # Privacy: member photos stay members-only.
    Given I am not signed in
    And photos are featured
    When I open the home page
    Then I see only the standard lake-house picture

  Scenario: Featuring and unfeaturing are recorded in history
    Given I am signed in as an approved member
    When I feature a 2026 photo I added
    Then the photo history shows that I featured a 2026 photo on the home page
```

## Open Questions

- **[medium]** The Featured page says "Tap the star on any photo to feature it on the home page" and "Tap the star on any photo in Albums…". But members can only feature their own photos, and content admins can unfeature others' photos but not feature them (`apps/mfr/app/photos/featured/page.tsx:25, 30`, `apps/mfr/app/photos/actions.ts:292-301`). Is the policy right, and should the copy say "your photos"?
- **[medium]** The home slideshow shows every featured photo from every member (up to 5 × the number of members), with no overall cap or curation (`apps/mfr/app/page.tsx:68`, `apps/mfr/lib/photos/gallery.ts:57-64`). Should there be a total limit or admin curation?

## Related Features

- CAP-004 Admin roles — content admins may unfeature others' photos
- CAP-006 Home page — hosts the slideshow of featured photos
- CAP-013 Photo albums — the star on each album tile
- CAP-015 Photo details — the Feature / Unfeature button in the enlarged view
- CAP-018 Photo history — feature and unfeature are recorded

## Code References

- `apps/mfr/app/photos/actions.ts:281-318` — setFeatured: owner-only feature, cap, admin unfeature
- `apps/mfr/lib/photos/constants.ts:14` — FEATURED_PER_USER = 5
- `apps/mfr/lib/photos/gallery.ts:57-73` — featured list and per-member count
- `apps/mfr/app/photos/featured/page.tsx` — Featured page and empty state
- `apps/mfr/app/photos/PhotoGallery.tsx:129-181, 271-297, 446-461` — star, toast, lightbox button
- `apps/mfr/app/page.tsx:15-17, 58-68, 134` — hero source and signed-out fallback
- `apps/mfr/app/HomeSlideshow.tsx:6-112` — 4.8s crossfade, dots, contain fit
- `apps/mfr/app/page.test.tsx:56-81, 191-210`, `apps/mfr/tests/photos-integration/gallery.test.ts:385-434`

## Change Log

- 2026-09-26 — Recovered from code.
