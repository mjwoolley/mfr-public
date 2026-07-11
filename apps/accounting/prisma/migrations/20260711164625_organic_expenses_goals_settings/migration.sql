/*
  Warnings:

  - Added the required column `category` to the `Expense` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Expense` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('TAXES', 'INSURANCE', 'UTILITIES', 'FURNISHINGS', 'REPAIRS', 'IMPROVEMENTS', 'OTHER');

-- Pre-redesign expenses carry no category/type and are deliberately wiped
-- (decision from the 2026-07 Organic redesign handoff review) so the new
-- NOT NULL columns can be added to a guaranteed-empty table. Expenses are
-- re-entered through the new Admin → Expenses dialog.
DELETE FROM "Expense";

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "capital" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "category" "ExpenseCategory" NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "ContributionGoal" (
    "year" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContributionGoal_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "contributionsVisibleToAll" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
