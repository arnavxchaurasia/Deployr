-- Per-project compression control ("auto" | "disabled") for the edge worker.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "compression_mode" TEXT NOT NULL DEFAULT 'auto';
