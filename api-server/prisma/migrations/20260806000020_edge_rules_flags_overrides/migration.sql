-- Edge rules (redirects/rewrites, headers, geo, rate limit), failover region,
-- integrations config, feature flags, status subscribers, and per-project
-- member role overrides.

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "redirect_rules" JSONB;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "header_rules" JSONB;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "geo_rules" JSONB;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "rate_limit_per_minute" INTEGER;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "failover_region" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "integrations" JSONB;

CREATE TABLE IF NOT EXISTS "FeatureFlag" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rollout_percent" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FeatureFlag_projectId_key_key" ON "FeatureFlag"("projectId", "key");
CREATE INDEX IF NOT EXISTS "FeatureFlag_projectId_idx" ON "FeatureFlag"("projectId");

ALTER TABLE "FeatureFlag"
  ADD CONSTRAINT "FeatureFlag_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "StatusSubscriber" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusSubscriber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StatusSubscriber_projectId_email_key" ON "StatusSubscriber"("projectId", "email");
CREATE INDEX IF NOT EXISTS "StatusSubscriber_projectId_idx" ON "StatusSubscriber"("projectId");

ALTER TABLE "StatusSubscriber"
  ADD CONSTRAINT "StatusSubscriber_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ProjectMemberOverride" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMemberOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectMemberOverride_projectId_userId_key" ON "ProjectMemberOverride"("projectId", "userId");
CREATE INDEX IF NOT EXISTS "ProjectMemberOverride_projectId_idx" ON "ProjectMemberOverride"("projectId");

ALTER TABLE "ProjectMemberOverride"
  ADD CONSTRAINT "ProjectMemberOverride_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
