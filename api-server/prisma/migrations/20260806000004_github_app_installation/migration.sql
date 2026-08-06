-- GitHub App installation support, alongside the existing PAT-based flow.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "githubAppInstallationId" INTEGER;
