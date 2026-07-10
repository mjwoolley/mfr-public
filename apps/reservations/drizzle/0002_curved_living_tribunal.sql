ALTER TABLE "accounts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification_tokens" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "accounts" CASCADE;--> statement-breakpoint
DROP TABLE "sessions" CASCADE;--> statement-breakpoint
DROP TABLE "users" CASCADE;--> statement-breakpoint
DROP TABLE "verification_tokens" CASCADE;--> statement-breakpoint
ALTER TABLE "activity_log" DROP CONSTRAINT "activity_log_actor_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "blocked_dates" DROP CONSTRAINT "blocked_dates_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "booking_rules" DROP CONSTRAINT "booking_rules_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "reservations" DROP CONSTRAINT "reservations_user_id_users_id_fk";
--> statement-breakpoint
DROP TYPE "public"."user_status";