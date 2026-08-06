-- Canary rollout support: route a percentage of traffic to a candidate
-- deployment before promoting it to fully replace production.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "canary_deployment_id" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "canary_percent" INTEGER NOT NULL DEFAULT 0;
