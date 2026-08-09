-- Governance: org-configurable audit log retention window.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "audit_log_retention_days" INTEGER;
