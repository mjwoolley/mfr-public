-- Additive schema for the member photo gallery (backlog §4): the two tables
-- `drizzle-kit push` would emit, applied here as targeted DDL instead — pushing
-- with --force against prod DROPS the reservations push-only objects (see
-- lib/db/push-only.sql and the drizzle-push gotcha). Idempotent (IF NOT EXISTS),
-- so safe to run more than once and safe to run BEFORE the code deploys (new,
-- unused tables touch no existing data).
--
-- Apply to a branch of the unified MFR DB with the DIRECT (non-pooled) URL, e.g.
--   psql "$DIRECT_URL" -f apps/mfr/lib/db/2026-07-18-photos-gallery.sql

CREATE TABLE IF NOT EXISTS portal_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  blob_url text NOT NULL,
  blob_pathname text NOT NULL,
  filename text NOT NULL DEFAULT '',
  byte_size integer NOT NULL DEFAULT 0,
  width integer NOT NULL DEFAULT 0,
  height integer NOT NULL DEFAULT 0,
  caption text,
  featured boolean NOT NULL DEFAULT false,
  featured_at timestamptz,
  uploaded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_photos_year_created_idx ON portal_photos (year, created_at);
CREATE INDEX IF NOT EXISTS portal_photos_uploader_created_idx ON portal_photos (uploaded_by, created_at);
CREATE INDEX IF NOT EXISTS portal_photos_featured_idx ON portal_photos (featured, featured_at);

CREATE TABLE IF NOT EXISTS portal_blob_backups (
  blob_pathname text PRIMARY KEY,
  backup_key text NOT NULL,
  byte_size integer NOT NULL DEFAULT 0,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
