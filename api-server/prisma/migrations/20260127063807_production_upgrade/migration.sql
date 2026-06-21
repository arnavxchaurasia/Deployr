/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `Project` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `slug` to the `Project` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "RepoProvider" AS ENUM ('GITHUB', 'GITLAB', 'BITBUCKET', 'OTHER');

-- CreateEnum
CREATE TYPE "DeployTrigger" AS ENUM ('MANUAL', 'WEBHOOK');

-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "branch" TEXT,
ADD COLUMN     "commitHash" TEXT,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "logsUrl" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "trigger" "DeployTrigger" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "deployedAt" TIMESTAMP(3),
ADD COLUMN     "framework" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastDeployedAt" TIMESTAMP(3),
ADD COLUMN     "latestDeploymentId" TEXT,
ADD COLUMN     "repoProvider" "RepoProvider" NOT NULL DEFAULT 'GITHUB',
ADD COLUMN     "slug" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "Project_slug_idx" ON "Project"("slug");
