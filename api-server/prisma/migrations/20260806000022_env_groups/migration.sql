-- Shared environment variable groups: reusable, org-owned sets of env vars
-- attachable to multiple projects.

CREATE TABLE IF NOT EXISTS "EnvGroup" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnvGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EnvGroup_orgId_name_key" ON "EnvGroup"("orgId", "name");
CREATE INDEX IF NOT EXISTS "EnvGroup_orgId_idx" ON "EnvGroup"("orgId");

ALTER TABLE "EnvGroup"
  ADD CONSTRAINT "EnvGroup_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "EnvGroupVariable" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnvGroupVariable_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EnvGroupVariable_groupId_key_key" ON "EnvGroupVariable"("groupId", "key");
CREATE INDEX IF NOT EXISTS "EnvGroupVariable_groupId_idx" ON "EnvGroupVariable"("groupId");

ALTER TABLE "EnvGroupVariable"
  ADD CONSTRAINT "EnvGroupVariable_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "EnvGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ProjectEnvGroup" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectEnvGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectEnvGroup_projectId_groupId_key" ON "ProjectEnvGroup"("projectId", "groupId");
CREATE INDEX IF NOT EXISTS "ProjectEnvGroup_projectId_idx" ON "ProjectEnvGroup"("projectId");
CREATE INDEX IF NOT EXISTS "ProjectEnvGroup_groupId_idx" ON "ProjectEnvGroup"("groupId");

ALTER TABLE "ProjectEnvGroup"
  ADD CONSTRAINT "ProjectEnvGroup_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectEnvGroup"
  ADD CONSTRAINT "ProjectEnvGroup_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "EnvGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
