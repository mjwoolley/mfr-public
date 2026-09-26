---
id: CAP-013
title: Photo albums
area: photos
status: implemented
source: recovered
related: [CAP-003, CAP-004, CAP-014, CAP-015, CAP-016, CAP-017]
---

# Photo albums

```gherkin
Feature: Photo albums
  Browse every family photo by year or by uploader.
  Capability: CAP-013

  Background:
    Given I am signed in as an approved member

  Scenario: Albums show photos grouped by year, newest year first
    Given family members have added photos taken in 2024 and 2026
    When I open "Albums" in the Photos section
    Then I see a "2026" section above a "2024" section
    And within each year the most recently added photos come first

  Scenario: By Year is the default view
    When I open "Albums" in the Photos section
    Then "By Year" is selected

  Scenario: Switching to By Uploader groups photos by who added them
    Given two family members have each added photos
    When I choose "By Uploader"
    Then I see one section per person, in alphabetical order by name
    And each section shows how many photos that person added, such as "3 photos" or "1 photo"
    And each person's photos are broken up under year sub-headings, newest year first
    And the page does not reload

  Scenario: My own uploader section is marked as mine
    Given I have added photos
    When I choose "By Uploader"
    Then my section is titled with my name followed by "(you)"

  Scenario: An uploader with no display name is shown by their email name
    Given a member with no display name added photos from "sam.miller@example.com"
    When I choose "By Uploader"
    Then their section is titled "sam.miller"

  Scenario: By Uploader shows each photo's file details
    Given a family member added "seed-gallery.jpg" from 2026 at 1600×1200
    When I choose "By Uploader"
    Then under that photo I see its year, "seed-gallery.jpg", "1600×1200" and its file size

  Scenario: Captions show under their photos
    Given a photo has the caption "Dock jump, 2026"
    When I open "Albums" in the Photos section
    Then I see "Dock jump, 2026" under that photo

  Scenario: No photos yet
    Given nobody has added any photos
    When I open "Albums" in the Photos section
    Then I see "No photos yet — add the first ones above."

  Scenario: The Photos section has Albums, Featured and History pages
    When I open the Photos section
    Then I can move between "Albums", "Featured" and "History"
    And the page I am on is highlighted

  Scenario: Signed-out visitors cannot see the albums
    # The approval gate itself is specified in CAP-003.
    Given I am not signed in
    When I try to open the photo albums
    Then I am taken to the sign-in page
    And no family photos are shown
```

## Open Questions

- **[low]** `docs/photos-design.md` (lines 1–150) still describes admin-curated "slides", rotating album cards, and Google Photos album links ("View" / "Add photos"). All of these were removed in #59, and `drizzle/0001_panoramic_slipstream.sql` drops their tables. `docs/backlog.md:82-84` lists "retire the admin slide uploader" as a follow-up, but it is already done. Should the docs be updated to match the member gallery?

## Related Features

- CAP-003 Access for unapproved accounts — the Photos section is members-only
- CAP-014 Add photos — the "Add photos" button sits at the top of Albums
- CAP-015 Photo details — clicking a photo opens it large
- CAP-016 Delete photos — multi-select delete happens from the album grid
- CAP-017 Featured photos — the star on each tile, and the Featured tab
- CAP-004 Admin roles — content admins can manage every photo in the albums

## Code References

- `apps/mfr/app/photos/page.tsx:16-57` — Albums page
- `apps/mfr/app/photos/AlbumsView.tsx:23-61` — By Year / By Uploader toggle and empty state
- `apps/mfr/lib/photos/gallery.ts:75-136` — groupings, ordering, uploader names
- `apps/mfr/app/photos/PhotoGallery.tsx:210-321, 371-398` — tiles, captions, file details
- `apps/mfr/app/photos/PhotosNav.tsx:10-24` — Albums / Featured / History nav
- `apps/mfr/app/photos/layout.tsx` — section layout
- `e2e/tests/gallery.spec.ts:14-53`, `apps/mfr/tests/photos-integration/galleryReads.test.ts`

## Change Log

- 2026-09-26 — Recovered from code.
