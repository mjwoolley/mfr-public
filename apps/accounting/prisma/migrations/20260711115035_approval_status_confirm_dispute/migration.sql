/*
  Warnings:

  - You are about to drop the column `approvedAt` on the `TransactionApproval` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DISPUTED');

-- AlterTable
ALTER TABLE "TransactionApproval" DROP COLUMN "approvedAt",
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "disputeReason" TEXT,
ADD COLUMN     "disputedAt" TIMESTAMP(3),
ADD COLUMN     "resolutionTransactionId" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING';
