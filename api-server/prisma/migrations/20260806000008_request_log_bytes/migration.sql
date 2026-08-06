-- Approximate response size per request, needed for a real bandwidth/usage number.
ALTER TABLE "RequestLog" ADD COLUMN IF NOT EXISTS "bytes" INTEGER NOT NULL DEFAULT 0;
