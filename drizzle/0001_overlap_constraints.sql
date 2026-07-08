-- Enable GiST support for the scalar/uuid columns used alongside the range
-- exclusion below (required by EXCLUDE USING gist on a mixed index).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prevent overlapping CONFIRMED reservations at the database level.
-- Half-open range [start_date, end_date): a reservation ending on day N and
-- one starting on day N do NOT conflict (same-day turnover is allowed).
-- Cancelled reservations are excluded from the WHERE clause so they never
-- block new bookings over the same dates.
ALTER TABLE reservations
  ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (
    daterange(start_date, end_date, '[)') WITH &&
  )
  WHERE (status = 'confirmed');

-- booking_rules must always be exactly one row, with id = 1.
ALTER TABLE booking_rules
  ADD CONSTRAINT booking_rules_singleton CHECK (id = 1);

-- Cross-table overlap protection: EXCLUDE constraints are single-table only,
-- so reservations <-> blocked_dates overlap is enforced via trigger
-- functions on both tables. Each raises a distinct, greppable message so
-- application code can tell which side blocked the write.

CREATE OR REPLACE FUNCTION check_reservation_not_blocked() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'confirmed' AND EXISTS (
    SELECT 1 FROM blocked_dates
    WHERE daterange(blocked_dates.start_date, blocked_dates.end_date, '[)')
          && daterange(NEW.start_date, NEW.end_date, '[)')
  ) THEN
    RAISE EXCEPTION 'reservation_overlaps_blocked_date';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reservation_not_blocked
  BEFORE INSERT OR UPDATE ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION check_reservation_not_blocked();

CREATE OR REPLACE FUNCTION check_blocked_date_not_reserved() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM reservations
    WHERE reservations.status = 'confirmed'
      AND daterange(reservations.start_date, reservations.end_date, '[)')
          && daterange(NEW.start_date, NEW.end_date, '[)')
  ) THEN
    RAISE EXCEPTION 'blocked_date_overlaps_reservation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_blocked_date_not_reserved
  BEFORE INSERT OR UPDATE ON blocked_dates
  FOR EACH ROW
  EXECUTE FUNCTION check_blocked_date_not_reserved();
