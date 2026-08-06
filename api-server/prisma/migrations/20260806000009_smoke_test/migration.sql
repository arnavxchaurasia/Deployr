-- Post-deploy smoke test path — optional, disabled by default.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "smoke_test_path" TEXT;
