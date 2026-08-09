-- Basic bot protection rules, evaluated at the Cloudflare worker.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "bot_protection" JSONB;
