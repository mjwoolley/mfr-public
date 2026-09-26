---
id: CAP-012
title: Family documents
area: reunion
status: implemented
source: recovered
related: [CAP-003, CAP-008]
---

# Family documents

```gherkin
Feature: Family documents
  Members browse and download the family Drive folder inside the site
  Capability: CAP-012

  Background:
    Given I am signed in as an approved member

  Scenario: Browsing the family folder
    Given an admin has linked the family Drive folder
    When I open Documents
    Then I see "Family documents."
    And I see the folder's contents with folders first, then files, each in alphabetical order
    And each file shows its size and last-modified date

  Scenario: Opening a subfolder
    When I choose a folder in Documents
    Then I see that folder's contents
    And a folder path lets me step back to any folder above it

  Scenario Outline: Which files open inside the site
    When I choose a <file type> file
    Then <outcome>

    Examples:
      | file type                    | outcome                                   |
      | PDF                          | it opens in a viewer on the page          |
      | plain text                   | it opens in a viewer on the page          |
      | JPEG, PNG, GIF or WEBP image | it opens in a viewer on the page          |
      | MP4 video                    | it plays in a viewer on the page          |
      | Google Doc or Slides         | it opens in the viewer as a PDF           |
      | Word, Excel or other file    | it is downloaded, with no viewer offered  |
      | web page or SVG image        | it is downloaded, with no viewer offered  |

  Scenario: Any file can be downloaded
    When I choose "Download" on a file
    Then the file downloads under its own name
    And a Google Doc or Slides file downloads as a PDF, a Google Sheet as an Excel file and a Google Drawing as a PNG

  Scenario: A preview that fails offers a download
    Given a file cannot be shown in the viewer
    When I open it
    Then I see "This file couldn't be previewed."
    And I am offered "Download instead"

  Scenario: Only the family folder can be browsed
    When I try to open a folder that is not inside the family folder
    Then I am shown the top of the family folder instead

  Scenario: Files outside the family folder can't be fetched
    When I try to download a file that is not inside the family folder
    Then I am told it was not found
    And nothing reveals whether that file exists

  Scenario: Empty folder
    Given the folder I opened has nothing in it
    Then I see "This folder is empty"

  Scenario: No folder linked yet
    Given no family Drive folder has been linked
    When I open Documents
    Then I see "No Drive folder linked yet"

  Scenario: The folder cannot be read right now
    Given the family Drive folder cannot be read
    When I open Documents
    Then I see "Documents are temporarily unavailable"
    And I see "We could not load the family documents right now. Please try again in a little while."
    But a site owner or manager is instead told to check the Drive access settings

  Scenario: Recent changes in Drive appear within a minute
    Given a file was just added to the family Drive folder
    When I open Documents one minute or more after it was added
    Then I see the new file
```

## Open Questions

- **[low]** When no folder is linked, every member sees "Set the shared Drive folder link in Admin…", an instruction only admins can follow. Should members see a neutral message instead? (`apps/mfr/app/documents/page.tsx:181-207`)
- **[low]** Documents is open to every approved member. Should any folders, such as corporation finances or meeting notes, be restricted to shareholders or admins? (`apps/mfr/app/documents/page.tsx:76`)

## Related Features

- CAP-003 Access for unapproved accounts — only approved members can open or download documents
- CAP-008 Site settings — admins link the family Drive folder there

## Code References

- `apps/mfr/app/documents/page.tsx` — page, folder-path navigation, root restriction, empty/unlinked/failed states
- `apps/mfr/app/documents/DocumentsBrowser.tsx` — rows, viewer, preview-failed fallback
- `apps/mfr/app/api/documents/download/route.ts` — download and inline view, outside-folder not found, safe inline types only
- `apps/mfr/lib/drive/client.ts:115-176` — listing, ordering, one-minute cache
- `apps/mfr/lib/drive/mime.ts`, `apps/mfr/lib/drive/viewable.ts` — export formats and viewable types
- `e2e/tests/web.spec.ts:114-135`

## Change Log

- 2026-09-26 — Recovered from code.
