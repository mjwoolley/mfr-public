-- Push-only DB objects that drizzle-kit push does NOT emit. Apply this AFTER
-- every `drizzle-kit push` to a fresh or reset branch of the unified MFR DB.
-- These originate from the reservations domain (formerly
-- apps/reservations/drizzle/0001_overlap_constraints.sql) and enforce booking
-- integrity that Drizzle's schema DSL can't express:
--   * the reservations_no_overlap GiST EXCLUDE constraint,
--   * the booking_rules id=1 singleton CHECK,
--   * the two cross-table blocked-date triggers (EXCLUDE can't span tables).
-- Written to be idempotent so it can be re-applied safely.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- A confirmed reservation must not overlap any blocked date range.
-- Tables are schema-qualified (public.*) so the trigger resolves them even when
-- search_path is empty — e.g. during a pg_dump data load, which sets
-- search_path='' and would otherwise fail these lookups mid-COPY.
CREATE OR REPLACE FUNCTION public.check_reservation_not_blocked() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'confirmed' AND EXISTS (
    SELECT 1 FROM public.blocked_dates
    WHERE daterange(blocked_dates.start_date, blocked_dates.end_date, '[)')
          && daterange(NEW.start_date, NEW.end_date, '[)')
  ) THEN
    RAISE EXCEPTION 'reservation_overlaps_blocked_date';
  END IF;
  RETURN NEW;
END;
$$;

-- A blocked date range must not overlap any confirmed reservation.
CREATE OR REPLACE FUNCTION public.check_blocked_date_not_reserved() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.reservations
    WHERE reservations.status = 'confirmed'
      AND daterange(reservations.start_date, reservations.end_date, '[)')
          && daterange(NEW.start_date, NEW.end_date, '[)')
  ) THEN
    RAISE EXCEPTION 'blocked_date_overlaps_reservation';
  END IF;
  RETURN NEW;
END;
$$;

-- No two confirmed reservations may overlap (half-open [start, end)).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_no_overlap') THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_no_overlap
      EXCLUDE USING gist (daterange(start_date, end_date, '[)') WITH &&)
      WHERE (status = 'confirmed');
  END IF;
END $$;

-- booking_rules is a single row (id = 1).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_rules_singleton') THEN
    ALTER TABLE public.booking_rules
      ADD CONSTRAINT booking_rules_singleton CHECK (id = 1);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_reservation_not_blocked ON public.reservations;
CREATE TRIGGER trg_reservation_not_blocked
  BEFORE INSERT OR UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.check_reservation_not_blocked();

DROP TRIGGER IF EXISTS trg_blocked_date_not_reserved ON public.blocked_dates;
CREATE TRIGGER trg_blocked_date_not_reserved
  BEFORE INSERT OR UPDATE ON public.blocked_dates
  FOR EACH ROW EXECUTE FUNCTION public.check_blocked_date_not_reserved();
