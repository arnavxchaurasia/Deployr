-- Persistent managed storage add-ons (Postgres/Redis/KV/blob), distinct
-- from ephemeral per-deployment preview databases.
CREATE TABLE IF NOT EXISTS "StorageAddon" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "env_var_key" TEXT NOT NULL,
    "provision_webhook_url" TEXT,
    "connection_string" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageAddon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StorageAddon_projectId_env_var_key_key" ON "StorageAddon"("projectId", "env_var_key");
CREATE INDEX IF NOT EXISTS "StorageAddon_projectId_idx" ON "StorageAddon"("projectId");

ALTER TABLE "StorageAddon"
  ADD CONSTRAINT "StorageAddon_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
