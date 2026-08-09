-- Tracks the last weekly digest send per org, to avoid double-sending.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "last_digest_sent_at" TIMESTAMP(3);
