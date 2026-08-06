-- Audit log export for compliance-minded orgs.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "audit_export_webhook_url" TEXT;
