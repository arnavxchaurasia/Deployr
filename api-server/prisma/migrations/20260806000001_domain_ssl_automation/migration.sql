-- Cloudflare for SaaS custom hostname tracking, so custom domains get an
-- automatically issued/renewed TLS certificate instead of relying on manual
-- setup outside the platform.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "cf_custom_hostname_id" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "ssl_status" TEXT DEFAULT 'none';
