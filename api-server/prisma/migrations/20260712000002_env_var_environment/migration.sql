-- Add environment column to EnvironmentVariable
ALTER TABLE "EnvironmentVariable" ADD COLUMN IF NOT EXISTS "environment" TEXT NOT NULL DEFAULT 'all';

-- Replace old unique index (projectId, key) with (projectId, key, environment)
DROP INDEX IF EXISTS "EnvironmentVariable_projectId_key_key";
CREATE UNIQUE INDEX IF NOT EXISTS "EnvironmentVariable_projectId_key_environment_key"
  ON "EnvironmentVariable"("projectId", "key", "environment");