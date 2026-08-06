-- Preview deployment protection: gate preview URLs behind a password.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "preview_protection_password_hash" TEXT;
