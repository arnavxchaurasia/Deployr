-- AlterTable: add preview deployment fields to Deployment
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "is_preview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "preview_subdomain" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Deployment_preview_subdomain_key" ON "Deployment"("preview_subdomain");