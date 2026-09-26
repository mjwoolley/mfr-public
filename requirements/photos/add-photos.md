---
id: CAP-014
title: Add photos
area: photos
status: implemented
source: recovered
related: [CAP-008, CAP-013, CAP-018, CAP-019]
---

# Add photos

```gherkin
Feature: Add photos
  Upload from phone or computer; filed by capture year, location removed, per-file errors.
  Capability: CAP-014

  Background:
    Given I am signed in as an approved member
    And I am on the Albums page

  Scenario: I can add several photos at once
    When I choose "Add photos" and pick 3 photos
    Then I see "Adding photos" with "Uploading 1 of 3…" as each photo goes up
    And when all 3 have been added they appear in the albums without me reloading

  Scenario: A single photo shows a single-photo progress message
    When I choose "Add photos" and pick 1 photo
    Then I see "Uploading your photo…"

  Scenario Outline: Accepted photo formats
    When I add a <format> photo
    Then it is added to the albums
    Examples:
      | format        |
      | JPEG          |
      | PNG           |
      | WebP          |
      | GIF           |
      | HEIC (iPhone) |

  Scenario: The page explains what happens to my photos
    Then I see "JPEG, PNG, WebP, GIF or HEIC (iPhone). Photos are filed by their capture date; large photos are resized and your location data is removed automatically."

  Scenario: A photo is filed under the year it was taken
    Given the current reunion year is 2026
    When I add a photo my camera recorded as taken in 2019
    Then the photo appears under 2019

  Scenario: A photo with no taken date is filed under the current reunion year
    # The reunion year is set by admins (CAP-008).
    Given the current reunion year is 2026
    When I add a screenshot that records no date taken
    Then the photo appears under 2026
    And I can change its year afterwards

  Scenario: Location data is removed from every photo I add
    Given my photo carries the location where it was taken
    When I add it
    Then the photo shown to the family carries no location data
    And it is turned the right way up

  Scenario: Large photos are resized
    When I add a photo whose longest side is 6000 pixels
    Then the family sees it with its longest side at 2560 pixels
    But a photo already 2560 pixels or smaller is never enlarged

  Scenario Outline: Photos over 25 MB are refused before uploading
    When I add a photo of <size>
    Then it is <outcome>
    Examples:
      | size          | outcome                                     |
      | exactly 25 MB | added                                       |
      | over 25 MB    | reported as "Larger than 25 MB." and not sent |

  Scenario: Every failed photo is named in a batch report
    When I add 4 photos and 2 of them cannot be added
    Then I see "2 of 4 photos added — 2 couldn’t be added:"
    And each failed photo is listed by file name with its reason
    And I see "Nothing was saved for the photos listed above. You can select them and try again."
    And the 2 that succeeded appear in the albums

  Scenario: A single photo that fails
    When I add 1 photo and it cannot be added
    Then I see "That photo couldn’t be added:" followed by its file name and reason

  Scenario: A whole batch that fails
    When I add 3 photos and none can be added
    Then I see "None of the 3 photos could be added:"
    And the albums are not refreshed

  Scenario: An unreadable image is refused
    When I add a file that cannot be read as an image
    Then it is listed with "That image could not be processed. Try a different photo."

  Scenario: A photo that could not be saved can be retried
    When the site cannot save a photo after preparing it
    Then it is listed with "Your photo could not be saved. Please try again."
    And the original I sent is kept so an operator can still recover it

  Scenario: The failure report stays until I dismiss it
    Given a batch left a failure report
    When I choose "Dismiss"
    Then the report goes away

  Scenario: Each added photo is recorded in history
    When I add a photo taken in 2026
    Then the photo history shows that I added a 2026 photo

  Scenario: Only approved members can add photos
    # Approval gate is specified in CAP-003.
    Given my account is awaiting approval
    When I try to add a photo
    Then the photo is refused and nothing is saved
```

## Open Questions

- **[high]** The step that finishes an upload accepts any web address, not just the member's own just-uploaded original (`z.string().url()`, `apps/mfr/app/photos/actions.ts:112`). The server then fetches that address and deletes it from storage, both after processing fails (`:136-139`) and after it succeeds (`:163`). It looks like an approved member could pass another member's photo address, get a copy under their own name, and break the original. It also lets the server fetch arbitrary addresses. The upload permission step doesn't restrict where the file is placed either (`apps/mfr/app/api/photos/upload-token/route.ts:18-26`). Should finalizing be limited to the member's own temporary upload?
- **[high]** Originals are held at public temporary addresses with their location data intact until finalizing succeeds. After a failed save, a closed tab or a timeout, they stay there indefinitely, and nothing sweeps them (`apps/mfr/app/photos/actions.ts:158-160`, `docs/backlog.md:229-245`). That undercuts the on-page promise that "your location data is removed automatically". How long may originals with location data remain, and should they be private?

## Related Features

- CAP-008 Site settings — the admin-set reunion year is the fallback filing year
- CAP-013 Photo albums — where new photos appear
- CAP-018 Photo history — each upload is recorded
- CAP-019 Photo backup and recovery — each added photo is backed up; stranded uploads can be recovered

## Code References

- `apps/mfr/app/photos/GalleryUploader.tsx:16-173` — picker, progress, per-file failure report
- `apps/mfr/app/api/photos/upload-token/route.ts:12-32` — approval gate, accepted types, 25 MB limit
- `apps/mfr/app/photos/actions.ts:79-174` — finalizeUpload: process, year rule, save, cleanup, history
- `apps/mfr/lib/photos/imageProcess.ts:37-75` — capture date, HEIC conversion, orientation, metadata strip, 2560px
- `apps/mfr/lib/photos/constants.ts` — MAX_UPLOAD_BYTES, MAX_DIMENSION, ACCEPTED_UPLOAD_TYPES
- `apps/mfr/app/photos/page.tsx:42-48` — help text and reunion-year fallback
- `apps/mfr/app/photos/GalleryUploader.test.tsx`, `apps/mfr/tests/photos-integration/gallery.test.ts:119-294`

## Change Log

- 2026-09-26 — Recovered from code.
