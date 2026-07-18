# Photos rotation & admin-curated slides — design

Status: approved design (2026-07-17). Next step: implementation plan.

## Summary

Improve the Photos experience with **rotating photo previews**, backed by a
small set of admin-curated images the site hosts itself:

1. **Home hero** — today a single static image (`/lake-house.jpg`). Rotate it
   through a dedicated **highlights** set, ~5 seconds per photo.
2. **Photos page album cards** — today each year's card shows a static cover
   (stock image for the first, the year number for the rest). Rotate each card
   through _that year's_ uploaded photos, ~5 seconds per photo, with a staggered
   start so cards don't all flip in unison.
3. **Admin uploads** — a new admin-only feature to upload the rotation photos
   per collection (each year, plus "Highlights") into the site's own storage.

The full photo archives stay in **Google Photos** exactly as today: the "View"
and "Add photos" buttons keep opening each year's Google Photos album, and
members keep contributing there. The uploaded slides are a _separate, additive_
set used only to power the rotating previews — nothing about how people
contribute full photos changes.

## Goals

- Home hero rotates through curated highlight photos.
- Each Photos-page album card rotates through that album's curated photos.
- Admins can upload / reorder / remove rotation photos per collection.
- Zero regression when a collection has no uploads (graceful static fallback).

## Non-goals

- Reading photos live from Google Photos (no practical API for shared albums).
- A full member-facing photo gallery / member uploads (tracked separately in
  `docs/backlog.md` as the "member photo gallery" future item).
- Changing how members contribute photos (still the Google Photos album).
- Deep-linking the "Add photos" button to Google's upload action (Google Photos
  provides no reliable URL for this; the button stays as-is).

## Decisions (from brainstorming)

- **Source:** admin-curated uploads to the site's own storage (Vercel Blob).
- **Home hero source:** a dedicated "highlights" collection.
- **"Add photos" button:** unchanged — keeps opening the Google Photos album.
- **Uploader access:** admins only (site owner / site manager — the same
  content admins who already manage album links under Admin).
- **Timing:** ~5s per slide on both surfaces; album cards start staggered.

## Data & storage

New table `portal_photo_slides` (portal schema):

| column          | type        | notes                                                          |
| --------------- | ----------- | -------------------------------------------------------------- |
| `id`            | uuid pk     | `defaultRandom()`                                              |
| `collection`    | text        | either a 4-digit year (`"2026"`) or the literal `"highlights"` |
| `blob_url`      | text        | the Vercel Blob public URL                                     |
| `blob_pathname` | text        | Blob pathname, kept so deletes can remove the underlying blob  |
| `sort_order`    | integer     | manual ordering within a collection (default: append)          |
| `uploaded_by`   | text        | identity user id of the admin who uploaded                     |
| `created_at`    | timestamptz | `defaultNow()`                                                 |

Index on `(collection, sort_order)` for the per-collection reads.

`collection` is a plain string (not a FK to `portal_photo_albums`) so the
special `"highlights"` value lives alongside the per-year values without a
schema special-case. Year collections correspond to `portal_photo_albums.year`
by value.

**Storage:** Vercel Blob (`@vercel/blob` + `BLOB_READ_WRITE_TOKEN`). Uploads
store the returned public URL + pathname; images are rendered with `next/image`
(add `blob.vercel-storage.com` to `next.config` `images.remotePatterns`).

## Admin upload UI

Under the portal **Admin** area (gated to site owner / site manager, the same
gate as album-link management):

- A collection selector: each configured year, plus **Highlights**.
- For the selected collection: a thumbnail strip of current slides, each with
  remove; drag-to-reorder (or up/down controls) writing `sort_order`.
- An uploader (file picker; multi-select) that uploads to Blob and appends rows.
- A soft cap (~12 per collection) enforced in the action, surfaced in the UI.

Server actions (admin-gated):

- `uploadSlides(collection, files)` → put each to Blob, insert rows appended.
- `removeSlide(id)` → delete the Blob object, delete the row.
- `reorderSlides(collection, orderedIds)` → rewrite `sort_order`.

All re-verify the caller is a content admin server-side; all validate
`collection` is `"highlights"` or a known album year; uploads validate
content-type (image/\*) and size.

## Home hero rotation

`app/page.tsx` loads the `highlights` slides (server-side) and passes their
blob URLs to the existing `HomeSlideshow`, which already crossfades every ~5s.
When highlights is empty, fall back to `['/lake-house.jpg']` (today's behavior —
no regression). `HomeSlideshow` is unchanged apart from receiving real URLs.

## Album-card rotation (/photos)

`app/photos/page.tsx` loads all slides grouped by year and passes each year's
slides into the card. A small client component (`AlbumCardRotator`) crossfades a
card's slides ~5s each, with a per-card staggered start (offset by card index)
so the grid doesn't flip in unison. A card with no slides renders today's
placeholder (stock cover for the first card / year number). Images lazy-load
(`next/image`, appropriate `sizes`); only the visible cards animate.

## "Add photos" & fallbacks

- "View" and "Add photos" are unchanged — both open the year's Google Photos
  album. (Google Photos exposes no reliable deep-link to its upload action.)
- Every rotation surface degrades to the current static presentation when its
  collection has no uploaded slides.

## Testing

- **Unit:** `AlbumCardRotator` / slideshow timing & index wrap (fake timers);
  the "empty collection → static fallback" branch on both surfaces.
- **Integration:** the admin server actions against the test branch — upload
  inserts rows for the right collection; remove deletes row (+ Blob call
  mocked); reorder rewrites `sort_order`; non-admin is rejected; invalid
  collection rejected. Blob SDK mocked so tests don't hit the network.
- **e2e:** admin uploads a slide to a year and to Highlights; the Photos card
  and home hero show a rotating image; a member cannot reach the admin uploader.

## Rollout

Additive and behind graceful fallbacks, so it ships dark: no rotation appears
until an admin uploads slides. Steps: add `@vercel/blob` + `BLOB_READ_WRITE_TOKEN`
(all envs) and the `blob.vercel-storage.com` image pattern; push the
`portal_photo_slides` table; ship the admin UI + rotators. Standard branch →
PR → green CI → merge (auto-deploys to prod).

## Open questions

None outstanding — all brainstorming decisions captured above.
