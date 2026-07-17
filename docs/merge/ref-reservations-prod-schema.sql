--
-- PostgreSQL database dump
--

\restrict lrTCJV1uyUedo5v4MGcknRSIO9cubFms8uES7Ud21tGSwCILWN2eCAdIhL5ggvB

-- Dumped from database version 17.10 (986efc8)
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA drizzle;


--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: reservation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reservation_status AS ENUM (
    'confirmed',
    'cancelled'
);


--
-- Name: check_blocked_date_not_reserved(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_blocked_date_not_reserved() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: check_reservation_not_blocked(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_reservation_not_blocked() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: -
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: -
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: -
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    actor_user_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: blocked_dates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocked_dates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason text,
    created_by uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: booking_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_rules (
    id integer DEFAULT 1 NOT NULL,
    booking_horizon_date date NOT NULL,
    max_consecutive_nights integer NOT NULL,
    max_nights_per_user_per_year integer NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT booking_rules_singleton CHECK ((id = 1))
);


--
-- Name: reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    status public.reservation_status DEFAULT 'confirmed'::public.reservation_status NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    cancelled_at timestamp without time zone,
    reminder_sent_at timestamp without time zone
);


--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: blocked_dates blocked_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_dates
    ADD CONSTRAINT blocked_dates_pkey PRIMARY KEY (id);


--
-- Name: booking_rules booking_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_rules
    ADD CONSTRAINT booking_rules_pkey PRIMARY KEY (id);


--
-- Name: reservations reservations_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_no_overlap EXCLUDE USING gist (daterange(start_date, end_date, '[)'::text) WITH &&) WHERE ((status = 'confirmed'::public.reservation_status));


--
-- Name: reservations reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_pkey PRIMARY KEY (id);


--
-- Name: blocked_dates trg_blocked_date_not_reserved; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_blocked_date_not_reserved BEFORE INSERT OR UPDATE ON public.blocked_dates FOR EACH ROW EXECUTE FUNCTION public.check_blocked_date_not_reserved();


--
-- Name: reservations trg_reservation_not_blocked; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reservation_not_blocked BEFORE INSERT OR UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.check_reservation_not_blocked();


--
-- PostgreSQL database dump complete
--

\unrestrict lrTCJV1uyUedo5v4MGcknRSIO9cubFms8uES7Ud21tGSwCILWN2eCAdIhL5ggvB

