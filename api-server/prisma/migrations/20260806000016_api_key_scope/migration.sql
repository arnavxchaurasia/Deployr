-- Scoped API keys: full (default) | deploy | read.
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'full';
