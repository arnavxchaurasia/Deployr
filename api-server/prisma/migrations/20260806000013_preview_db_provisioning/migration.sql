-- Ephemeral preview databases — provider-agnostic provisioning webhook.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "preview_db_provision_webhook_url" TEXT;
