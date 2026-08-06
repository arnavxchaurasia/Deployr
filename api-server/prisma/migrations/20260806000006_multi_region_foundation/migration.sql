-- Multi-region deploy foundation: which AWS region a project's builds run
-- in, denormalized onto each deployment at trigger time.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "region" TEXT NOT NULL DEFAULT 'us-east-1';
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "region" TEXT NOT NULL DEFAULT 'us-east-1';
