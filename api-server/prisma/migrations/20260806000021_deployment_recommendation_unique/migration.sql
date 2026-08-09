-- insightsService.js has always upserted on (deploymentId, ruleCode), but
-- this unique index never existed — every upsert threw, silently breaking
-- AI Insights whenever there was anything to recommend. Some rows may
-- already be duplicates from the createMany-fallback path; dedupe (keep the
-- most recent) before adding the index so the migration doesn't fail on
-- existing data.
DELETE FROM "DeploymentRecommendation" a
USING "DeploymentRecommendation" b
WHERE a."deploymentId" = b."deploymentId"
  AND a."ruleCode" = b."ruleCode"
  AND a."createdAt" < b."createdAt";

CREATE UNIQUE INDEX IF NOT EXISTS "DeploymentRecommendation_deploymentId_ruleCode_key"
  ON "DeploymentRecommendation"("deploymentId", "ruleCode");
