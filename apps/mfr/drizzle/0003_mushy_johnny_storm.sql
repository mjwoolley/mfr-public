ALTER TABLE "Transaction" ADD COLUMN "enteredAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
UPDATE "Transaction" SET "enteredAt" = "createdAt";