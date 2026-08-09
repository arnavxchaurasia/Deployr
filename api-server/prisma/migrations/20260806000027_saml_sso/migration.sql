-- SAML SSO configuration per org.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "saml_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "saml_entry_point" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "saml_issuer" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "saml_cert" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "sso_domain" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_sso_domain_key" ON "Organization"("sso_domain");
