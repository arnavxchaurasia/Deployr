-- DropIndex
DROP INDEX "User_email_idx";

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resetToken" TEXT,
ADD COLUMN     "resetTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "verifyToken" TEXT,
ADD COLUMN     "verifyTokenExpiry" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DeploymentSignal" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "nodeVersion" TEXT,
    "packageManager" TEXT,
    "dependencyCount" INTEGER,
    "buildTimeMs" INTEGER,
    "installTimeMs" INTEGER,
    "bundleTimeMs" INTEGER,
    "warningsCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeploymentSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeploymentSignal_deploymentId_idx" ON "DeploymentSignal"("deploymentId");
