---
id: CAP-019
title: Photo backup and recovery
area: photos
status: implemented
source: recovered
related: [CAP-014, CAP-016]
---

# Photo backup and recovery

```gherkin
Feature: Photo backup and recovery
  Deleted photos stay recoverable for 30 days.
  Capability: CAP-019

  Scenario: Every photo added is copied to an independent backup
    Given backups are switched on for the live site
    When a member adds a photo
    Then a copy of the photo as the family sees it is kept in a separate backup store

  Scenario: A failed backup never fails the member's upload
    Given the backup store is unavailable
    When a member adds a photo
    Then the photo is still added to the albums
    And the member sees no error

  Scenario: Missed backups are caught up daily
    Given a photo was added while the backup store was unavailable
    When the daily backup check runs
    Then that photo is copied to the backup store

  Scenario Outline: A deleted photo's backup is kept for 30 days
    Given a backed-up photo was deleted <age> ago
    When the daily backup check runs
    Then its backup is <outcome>
    Examples:
      | age             | outcome                                    |
      | 30 days or less | kept, so an operator can still restore it  |
      | more than 30 days | permanently removed                      |

  Scenario: A backup that cannot be removed is retried the next day
    Given a deleted photo's backup is past the 30-day window
    And the backup store refuses the removal
    When the daily backup check runs
    Then the backup is kept and tried again on the next run

  Scenario: Only the scheduled job can run the backup check
    When someone without the site's scheduler credentials asks the backup check to run
    Then it is refused and nothing is backed up or removed

  Scenario: An operator can restore a deleted photo within the window
    Given a member deleted a photo 10 days ago
    When an operator restores it from the backup
    Then the photo is back in the albums

  Scenario: An operator can recover uploads that never finished
    Given a member's photos reached the site but were never saved to the albums
    When an operator recovers them on that member's behalf
    Then the photos appear in the albums as added by that member
    And each is filed under the year it was taken, or the year the operator gives
    And the photo history records them as added
    But uploads less than an hour old are left alone in case they are still finishing

  Scenario: Test and preview sites never write to the backup store
    Given I am using a test or preview copy of the site
    When a member adds or deletes a photo
    Then nothing is written to or removed from the backup store
```

## Open Questions

- **[high]** Members are told "Backups are kept for 30 days". In practice there is no backup for a photo deleted before its copy succeeded or before the daily check caught up, and restoring is a manual operator procedure with no screen for members or admins (`apps/mfr/app/photos/actions.ts:42-64, 227-231`, `docs/photos-design.md:193-196`). What exactly should members be promised, and who can request a restore?
- **[medium]** Photos are stored at public web addresses. The albums are members-only, but anyone holding a photo's link can view it without signing in (`apps/mfr/lib/photos/blobStore.ts:13`). Is that acceptable for family photos, or should photo links require sign-in?

## Related Features

- CAP-014 Add photos — each added photo is backed up; stranded uploads are recoverable
- CAP-016 Delete photos — deletion starts the 30-day recovery window

## Code References

- `apps/mfr/lib/photos/backupStore.ts:36-100` — backup on/off switch, copy, remove, health probe
- `apps/mfr/app/photos/actions.ts:42-64, 227-231` — best-effort backup on upload; mark deleted
- `apps/mfr/app/api/cron/photo-backup/route.ts:16-66` — daily reconcile and 30-day purge, scheduler secret
- `apps/mfr/vercel.json` — daily schedule (08:00 UTC)
- `apps/mfr/lib/photos/constants.ts:17` — BACKUP_RETENTION_DAYS = 30
- `apps/mfr/scripts/recover-orphaned-uploads.ts` — operator recovery of unfinished uploads
- `apps/mfr/app/api/health/route.ts` — database and backup-store health probe
- `docs/photos-design.md:178-196` — manual restore procedure
- `apps/mfr/tests/photos-integration/cron.test.ts`, `apps/mfr/lib/photos/backupStore.test.ts`

## Change Log

- 2026-09-26 — Recovered from code.
