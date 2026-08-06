-- Maintenance mode toggle.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "maintenance_mode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "maintenance_message" TEXT;
