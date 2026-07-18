# Photos design (as-built)

The Photos experience: how the rotating home hero and per-year album-card
slideshows work, and how the admin-curated images that feed them are stored and
managed. This documents what is actually shipped (PR #42, merged 2026-07-18).

The original brainstorming spec is
`docs/superpowers/specs/2026-07-17-photos-rotation-design.md`; this file is the
authoritative as-built reference and notes where the implementation differs.

## Overview

Two sources of photos coexist:

1. **Google Photos shared albums** — the canonical archive. Each reunion year
   has an album link (`portal_photo_albums.url`); the "View" and "Add photos"
   buttons on `/photos` open it, and members contribute there. Nothing about
   this changed — Google Photos has no practical API to read a shared album's
   individual photos, so we never try to.
2. **Admin-curated "slides"** — a small set of images the site hosts itself in
   **Vercel Blob**, used only to power the rotating previews on the home hero
   and the `/photos` album cards. Additive; the pages fall back to their static
   presentation when a collection has no slides ("ships dark").

A **collection** is either a 4-digit reunion year (e.g. `"2026"`, tying slides
to that album by value) or the literal `"highlights"` (the home hero set).

## Data model

Table `portal_photo_slides` (portal schema —
`apps/mfr/lib/db/schema/portal.ts`):

| column          | type          | notes                                            |
| --------------- | ------------- | ------------------------------------------------ |
| `id`            | `uuid` PK     | `defaultRandom()`                                |
| `collection`    | `text`        | `"highlights"` or a 4-digit year                 |
| `blob_url`      | `text`        | Vercel Blob public URL (rendered via next/image) |
| `blob_pathname` | `text`        | Blob pathname, kept so deletes remove the object |
| `sort_order`    | `integer`     | display order within a collection (default 0)    |
| `uploaded_by`   | `text`        | identity user id of the uploading admin          |
| `created_at`    | `timestamptz` | `defaultNow()`                                   |

Index `portal_photo_slides_collection_order_idx` on `(collection, sort_order)`.
`collection` is a plain string (no FK) so `"highlights"` lives alongside year
values without a schema special-case.

## Storage — Vercel Blob

- Package `@vercel/blob`; wrapper `apps/mfr/lib/photos/blobStore.ts`
  (`putSlideImage` / `deleteSlideImage`) so the actions never import the SDK
  directly (mockable; tests need no token or network).
- `putSlideImage` uploads to a unique public path
  `photo-slides/<uuid>-<filename>` with `access: 'public'`.
- Production store: **`mfr-photos`** (public), linked to the `mfr_web` Vercel
  project, which auto-provisions `BLOB_READ_WRITE_TOKEN` on all env scopes.
  Reads/rotation work off the stored URLs even without the token; only uploads
  require it.
- `next.config.ts` allows `**.blob.vercel-storage.com` in
  `images.remotePatterns` so `next/image` can optimize the blobs.

## Reads

`apps/mfr/lib/photos/slides.ts` (server):

- `getSlides(collection)` → `{ id, blobUrl }[]` ordered by `sort_order` then
  `created_at`.
- `getHighlightSlides()` → the `"highlights"` collection (home hero).
- `getSlidesByCollection()` → `Map<collection, {id, blobUrl}[]>` (all rows),
  used by `/photos` (keyed by `String(year)`) and the admin editor.
- `HIGHLIGHTS = 'highlights'` constant.

## Admin management (content-admin only)

Server actions `apps/mfr/app/admin/photos/actions.ts`, each gated by
`requirePortalContentAdmin()` (site owner or manager):

- `uploadSlides(collection, files)` — validates the collection
  (`/^(highlights|\d{4})$/`), rejects empty/non-image files, enforces the
  `SLIDE_CAP` (12) per collection, uploads each to Blob, inserts rows appended
  by `sort_order`, records `uploaded_by`.
- `removeSlide(id)` — deletes the Blob object then the row (idempotent if the
  row is gone).
- `reorderSlides(collection, orderedIds)` — rewrites `sort_order` to the given
  order in a transaction.

`SLIDE_CAP` and the `ActionResult` type live in a **plain module**
`apps/mfr/app/admin/photos/constants.ts` — _not_ in `actions.ts`. A `"use
server"` file may only export async functions, so the client component imports
these from `constants.ts`. (This is the main deviation from the spec.)

UI: `apps/mfr/app/admin/photos/SlidesEditor.tsx` — a panel in the Admin page
("Rotating photos") with a collection selector (each album year + "Highlights"),
a thumbnail strip with remove + up/down reorder, and a multi-file image picker.
Wired in `apps/mfr/app/admin/page.tsx` (collections = `Highlights` + each album
year; slides passed as a plain object via `Object.fromEntries`).

## Home hero rotation

`apps/mfr/app/page.tsx` loads `getHighlightSlides()` and passes the blob URLs to
the existing `HomeSlideshow` (`apps/mfr/app/HomeSlideshow.tsx`), which crossfades
every ~4.8s. Empty highlights → falls back to `['/lake-house.jpg']`.

**The home hero is public** — highlight photos are visible to signed-out
visitors, same as the static fallback today. Gate to signed-in members if that
becomes a concern.

## Album-card rotation

`apps/mfr/app/photos/AlbumCardRotator.tsx` (client) crossfades a card's slides
every **5000ms**, with a per-card **stagger** of `index * 900ms` so a grid of
cards doesn't flip in unison; a single slide just shows statically (no timer).
`apps/mfr/app/photos/page.tsx` renders it when the year has slides, else keeps
today's placeholder (stock cover for the first card / the year number).

## Fallbacks

Every rotation surface degrades to its prior static presentation when its
collection is empty. "View"/"Add photos" always open the Google Photos album.

## File map

| File                                           | Responsibility                       |
| ---------------------------------------------- | ------------------------------------ |
| `lib/db/schema/portal.ts`                      | `portalPhotoSlides` table            |
| `lib/photos/slides.ts`                         | read helpers                         |
| `lib/photos/blobStore.ts`                      | Vercel Blob wrapper                  |
| `app/admin/photos/actions.ts`                  | upload/remove/reorder server actions |
| `app/admin/photos/constants.ts`                | `SLIDE_CAP`, `ActionResult`          |
| `app/admin/photos/SlidesEditor.tsx`            | admin uploader UI                    |
| `app/admin/page.tsx`                           | wires the editor in                  |
| `app/page.tsx` + `app/HomeSlideshow.tsx`       | home hero rotation                   |
| `app/photos/AlbumCardRotator.tsx` + `page.tsx` | album-card rotation                  |
| `next.config.ts`                               | blob image host                      |

## Tests

- Integration (`tests/photos-integration/`, vitest project `photos-integration`):
  read helpers + all admin-action branches (Blob mocked, auth mocked).
- Unit: `AlbumCardRotator` timing/wrap; home-hero source selection
  (`app/page.test.tsx`); Blob wrapper.
- e2e (`e2e/tests/photos.spec.ts`): seeded slides render on the hero + a card;
  the uploader is content-admin-only. `e2e/global-setup.ts` seeds slides
  pointing at a `/public` asset so e2e needs no Blob.

## Operational notes

- **Adding the prod table:** use targeted `CREATE TABLE`/`CREATE INDEX` DDL, not
  `drizzle-kit push --force` — the latter drops the reservations push-only
  objects (GiST/CHECK/triggers). See the drizzle-push gotcha in project memory.
- **Ships dark:** no visual change until an admin uploads slides.
- Out of scope (see `docs/backlog.md` "member photo gallery"): member uploads,
  captions, a full in-site gallery.
