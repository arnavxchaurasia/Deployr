-- Org-scoped lifecycle event webhook (member joined/left, project transferred, plan changed).
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "webhook_url" TEXT;
