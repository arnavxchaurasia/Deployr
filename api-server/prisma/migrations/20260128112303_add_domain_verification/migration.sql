/*
  Warnings:

  - A unique constraint covering the columns `[domainVerificationToken]` on the table `Project` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "domainVerificationToken" TEXT,
ADD COLUMN     "domainVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Project_domainVerificationToken_key" ON "Project"("domainVerificationToken");
