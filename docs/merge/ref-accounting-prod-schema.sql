--
-- PostgreSQL database dump
--

\restrict IVfH0Hn4KYWdndntTmty43H7PZr1u8gTkHisRwOTzpL3ylZ3ZVsMTsEhDEtcxfc

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
-- Name: ApprovalStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ApprovalStatus" AS ENUM (
    'PENDING',
    'CONFIRMED',
    'DISPUTED'
);


--
-- Name: ExpenseCategory; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ExpenseCategory" AS ENUM (
    'TAXES',
    'INSURANCE',
    'UTILITIES',
    'FURNISHINGS',
    'REPAIRS',
    'IMPROVEMENTS',
    'OTHER'
);


--
-- Name: TransactionType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TransactionType" AS ENUM (
    'CONTRIBUTION',
    'TRANSFER',
    'ADJUSTMENT',
    'CORRECTION'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AppSettings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AppSettings" (
    id text DEFAULT 'singleton'::text NOT NULL,
    "contributionsVisibleToAll" boolean DEFAULT true NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: ContributionGoal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ContributionGoal" (
    year integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Expense; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Expense" (
    id text NOT NULL,
    description text NOT NULL,
    amount numeric(12,2) NOT NULL,
    "incurredAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdByName" text,
    "createdByEmail" text,
    capital boolean DEFAULT false NOT NULL,
    category public."ExpenseCategory" NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: LedgerEntry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LedgerEntry" (
    id text NOT NULL,
    "transactionId" text NOT NULL,
    "shareholderId" text NOT NULL,
    shares numeric(12,2) NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Shareholder; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Shareholder" (
    id text NOT NULL,
    name text NOT NULL,
    email text,
    active boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "userId" text
);


--
-- Name: Transaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Transaction" (
    id text NOT NULL,
    type public."TransactionType" NOT NULL,
    description text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdById" text NOT NULL,
    "createdByName" text,
    "createdByEmail" text,
    "correctsTransactionId" text,
    deleted boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp(3) without time zone
);


--
-- Name: TransactionApproval; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TransactionApproval" (
    id text NOT NULL,
    "transactionId" text NOT NULL,
    "shareholderId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "confirmedAt" timestamp(3) without time zone,
    "disputeReason" text,
    "disputedAt" timestamp(3) without time zone,
    "resolutionTransactionId" text,
    "resolvedAt" timestamp(3) without time zone,
    status public."ApprovalStatus" DEFAULT 'PENDING'::public."ApprovalStatus" NOT NULL
);


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: AppSettings AppSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AppSettings"
    ADD CONSTRAINT "AppSettings_pkey" PRIMARY KEY (id);


--
-- Name: ContributionGoal ContributionGoal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContributionGoal"
    ADD CONSTRAINT "ContributionGoal_pkey" PRIMARY KEY (year);


--
-- Name: Expense Expense_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Expense"
    ADD CONSTRAINT "Expense_pkey" PRIMARY KEY (id);


--
-- Name: LedgerEntry LedgerEntry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LedgerEntry"
    ADD CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY (id);


--
-- Name: Shareholder Shareholder_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Shareholder"
    ADD CONSTRAINT "Shareholder_pkey" PRIMARY KEY (id);


--
-- Name: TransactionApproval TransactionApproval_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransactionApproval"
    ADD CONSTRAINT "TransactionApproval_pkey" PRIMARY KEY (id);


--
-- Name: Transaction Transaction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: Expense_incurredAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Expense_incurredAt_idx" ON public."Expense" USING btree ("incurredAt");


--
-- Name: LedgerEntry_shareholderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "LedgerEntry_shareholderId_idx" ON public."LedgerEntry" USING btree ("shareholderId");


--
-- Name: LedgerEntry_transactionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "LedgerEntry_transactionId_idx" ON public."LedgerEntry" USING btree ("transactionId");


--
-- Name: Shareholder_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Shareholder_email_key" ON public."Shareholder" USING btree (email);


--
-- Name: Shareholder_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Shareholder_userId_key" ON public."Shareholder" USING btree ("userId");


--
-- Name: TransactionApproval_shareholderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TransactionApproval_shareholderId_idx" ON public."TransactionApproval" USING btree ("shareholderId");


--
-- Name: TransactionApproval_transactionId_shareholderId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TransactionApproval_transactionId_shareholderId_key" ON public."TransactionApproval" USING btree ("transactionId", "shareholderId");


--
-- Name: Transaction_correctsTransactionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Transaction_correctsTransactionId_idx" ON public."Transaction" USING btree ("correctsTransactionId");


--
-- Name: Transaction_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Transaction_type_idx" ON public."Transaction" USING btree (type);


--
-- Name: LedgerEntry LedgerEntry_shareholderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LedgerEntry"
    ADD CONSTRAINT "LedgerEntry_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES public."Shareholder"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: LedgerEntry LedgerEntry_transactionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LedgerEntry"
    ADD CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES public."Transaction"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TransactionApproval TransactionApproval_shareholderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransactionApproval"
    ADD CONSTRAINT "TransactionApproval_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES public."Shareholder"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TransactionApproval TransactionApproval_transactionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransactionApproval"
    ADD CONSTRAINT "TransactionApproval_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES public."Transaction"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Transaction Transaction_correctsTransactionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_correctsTransactionId_fkey" FOREIGN KEY ("correctsTransactionId") REFERENCES public."Transaction"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict IVfH0Hn4KYWdndntTmty43H7PZr1u8gTkHisRwOTzpL3ylZ3ZVsMTsEhDEtcxfc

