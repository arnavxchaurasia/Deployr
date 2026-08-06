-- Custom 404/500 error pages, served by the Cloudflare worker.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "custom_404_html" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "custom_500_html" TEXT;
