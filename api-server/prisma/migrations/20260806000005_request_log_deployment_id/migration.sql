-- Per-deployment request telemetry, needed to compare a canary's error rate
-- against the active deployment's.
ALTER TABLE "RequestLog" ADD COLUMN IF NOT EXISTS "deploymentId" TEXT;
CREATE INDEX IF NOT EXISTS "RequestLog_deploymentId_timestamp_idx" ON "RequestLog"("deploymentId", "timestamp");
