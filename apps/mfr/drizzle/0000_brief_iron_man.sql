CREATE TYPE "public"."user_status" AS ENUM('pending', 'approved', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ApprovalStatus" AS ENUM('PENDING', 'CONFIRMED', 'DISPUTED');--> statement-breakpoint
CREATE TYPE "public"."ExpenseCategory" AS ENUM('TAXES', 'INSURANCE', 'UTILITIES', 'FURNISHINGS', 'REPAIRS', 'IMPROVEMENTS', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."TransactionType" AS ENUM('CONTRIBUTION', 'TRANSFER', 'ADJUSTMENT', 'CORRECTION');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_sub" text,
	"email" text NOT NULL,
	"name" text,
	"image" text,
	"email_verified" timestamp,
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"is_reservations_admin" boolean DEFAULT false NOT NULL,
	"is_accounting_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "portal_blob_backups" (
	"blob_pathname" text PRIMARY KEY NOT NULL,
	"backup_key" text NOT NULL,
	"byte_size" integer DEFAULT 0 NOT NULL,
	"backed_up_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "portal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"start_date" date,
	"end_date" date,
	"time" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"meeting_link" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_meal_rsvps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_user_id" uuid NOT NULL,
	"day_index" integer NOT NULL,
	"meal" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_meal_rsvps_unique" UNIQUE("identity_user_id","day_index","meal")
);
--> statement-breakpoint
CREATE TABLE "portal_photo_albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_photo_albums_year_unique" UNIQUE("year")
);
--> statement-breakpoint
CREATE TABLE "portal_photo_slides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection" text NOT NULL,
	"blob_url" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"blob_url" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"filename" text DEFAULT '' NOT NULL,
	"byte_size" integer DEFAULT 0 NOT NULL,
	"width" integer DEFAULT 0 NOT NULL,
	"height" integer DEFAULT 0 NOT NULL,
	"caption" text,
	"featured" boolean DEFAULT false NOT NULL,
	"featured_at" timestamp with time zone,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_settings" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"reunion_year" integer DEFAULT 2026 NOT NULL,
	"reunion_start" date,
	"reunion_end" date,
	"highlights_url" text DEFAULT '' NOT NULL,
	"drive_url" text DEFAULT '' NOT NULL,
	"venmo_url" text DEFAULT '' NOT NULL,
	"chat_url" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_user_roles" (
	"identity_user_id" uuid PRIMARY KEY NOT NULL,
	"is_site_owner" boolean DEFAULT false NOT NULL,
	"is_site_manager" boolean DEFAULT false NOT NULL,
	"is_accounting_manager" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"actor_user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocked_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_rules" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"booking_horizon_date" date NOT NULL,
	"max_consecutive_nights" integer NOT NULL,
	"max_nights_per_user_per_year" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "reservation_status" DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"cancelled_at" timestamp,
	"reminder_sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "AppSettings" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"contributionsVisibleToAll" boolean DEFAULT true NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ContributionGoal" (
	"year" integer PRIMARY KEY NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Expense" (
	"id" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"incurredAt" timestamp (3) NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"createdByUserId" text NOT NULL,
	"createdByName" text,
	"createdByEmail" text,
	"capital" boolean DEFAULT false NOT NULL,
	"category" "ExpenseCategory" NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "LedgerEntry" (
	"id" text PRIMARY KEY NOT NULL,
	"transactionId" text NOT NULL,
	"shareholderId" text NOT NULL,
	"shares" numeric(12, 2) NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Shareholder" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"userId" text
);
--> statement-breakpoint
CREATE TABLE "Transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "TransactionType" NOT NULL,
	"description" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"createdById" text NOT NULL,
	"createdByName" text,
	"createdByEmail" text,
	"correctsTransactionId" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"deletedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "TransactionApproval" (
	"id" text PRIMARY KEY NOT NULL,
	"transactionId" text NOT NULL,
	"shareholderId" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"confirmedAt" timestamp (3),
	"disputeReason" text,
	"disputedAt" timestamp (3),
	"resolutionTransactionId" text,
	"resolvedAt" timestamp (3),
	"status" "ApprovalStatus" DEFAULT 'PENDING' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "public"."Transaction"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES "public"."Shareholder"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_correctsTransactionId_fkey" FOREIGN KEY ("correctsTransactionId") REFERENCES "public"."Transaction"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TransactionApproval" ADD CONSTRAINT "TransactionApproval_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "public"."Transaction"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TransactionApproval" ADD CONSTRAINT "TransactionApproval_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES "public"."Shareholder"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "portal_photo_slides_collection_order_idx" ON "portal_photo_slides" USING btree ("collection","sort_order");--> statement-breakpoint
CREATE INDEX "portal_photos_year_created_idx" ON "portal_photos" USING btree ("year","created_at");--> statement-breakpoint
CREATE INDEX "portal_photos_uploader_created_idx" ON "portal_photos" USING btree ("uploaded_by","created_at");--> statement-breakpoint
CREATE INDEX "portal_photos_featured_idx" ON "portal_photos" USING btree ("featured","featured_at");--> statement-breakpoint
CREATE INDEX "Expense_incurredAt_idx" ON "Expense" USING btree ("incurredAt" timestamp_ops);--> statement-breakpoint
CREATE INDEX "LedgerEntry_shareholderId_idx" ON "LedgerEntry" USING btree ("shareholderId" text_ops);--> statement-breakpoint
CREATE INDEX "LedgerEntry_transactionId_idx" ON "LedgerEntry" USING btree ("transactionId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Shareholder_email_key" ON "Shareholder" USING btree ("email" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Shareholder_userId_key" ON "Shareholder" USING btree ("userId" text_ops);--> statement-breakpoint
CREATE INDEX "Transaction_correctsTransactionId_idx" ON "Transaction" USING btree ("correctsTransactionId" text_ops);--> statement-breakpoint
CREATE INDEX "Transaction_type_idx" ON "Transaction" USING btree ("type" enum_ops);--> statement-breakpoint
CREATE INDEX "TransactionApproval_shareholderId_idx" ON "TransactionApproval" USING btree ("shareholderId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "TransactionApproval_transactionId_shareholderId_key" ON "TransactionApproval" USING btree ("transactionId" text_ops,"shareholderId" text_ops);