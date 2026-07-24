-- Build configuration fields
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "build_command"   TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "output_dir"      TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "install_command" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "root_dir"        TEXT;

-- Deploy hooks & notification webhooks
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "deploy_hook_token"   TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "notify_webhook_url"  TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Project_deploy_hook_token_key" ON "Project"("deploy_hook_token");

-- Uptime monitoring
CREATE TABLE IF NOT EXISTS "UptimeCheck" (
  "id"         TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "projectId"  TEXT        NOT NULL,
  "up"         BOOLEAN     NOT NULL,
  "statusCode" INT,
  "latencyMs"  INT,
  "checkedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UptimeCheck_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UptimeCheck_projectId_fkey" FOREIGN KEY ("projectId")
    REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "UptimeCheck_projectId_checkedAt_idx"
  ON "UptimeCheck"("projectId", "checkedAt");