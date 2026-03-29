/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `PendingCode` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "PendingCode_email_idx";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "reviewsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "PendingCode_email_key" ON "PendingCode"("email");
