-- A/B testing: variants of a deployment, persistent per-visitor assignment,
-- optional path rewrite per variant, exposure/conversion event log.
CREATE TABLE IF NOT EXISTS "Experiment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "variants" JSONB NOT NULL,
    "goalPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Experiment_projectId_key_key" ON "Experiment"("projectId", "key");
CREATE INDEX IF NOT EXISTS "Experiment_projectId_idx" ON "Experiment"("projectId");

ALTER TABLE "Experiment"
  ADD CONSTRAINT "Experiment_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ExperimentEvent" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExperimentEvent_experimentId_type_createdAt_idx" ON "ExperimentEvent"("experimentId", "type", "createdAt");

ALTER TABLE "ExperimentEvent"
  ADD CONSTRAINT "ExperimentEvent_experimentId_fkey"
  FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
