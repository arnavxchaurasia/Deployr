-- Manual promotion gate: a production build can be held for approval
-- instead of auto-promoting.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "require_approval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "awaitingApproval" BOOLEAN NOT NULL DEFAULT false;
