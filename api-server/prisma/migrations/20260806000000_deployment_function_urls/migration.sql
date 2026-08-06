-- Persist per-function Lambda Function URLs deployed from a repo's
-- functions/*.js directory, instead of relying on parsing raw build logs.
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "function_urls" JSONB;
