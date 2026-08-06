-- Deployment blackout windows — recurring weekly UTC windows that block deploys.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "blackout_windows" JSONB;
