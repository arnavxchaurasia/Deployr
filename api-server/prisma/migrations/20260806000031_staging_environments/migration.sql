-- Staging environments: a persistent, manually-promoted third deployment
-- tier distinct from ephemeral previews and production.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "staging_branch" TEXT;
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "is_staging" BOOLEAN NOT NULL DEFAULT false;
