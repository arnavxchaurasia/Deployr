-- Distributed tracing: simplified spans ingested from deployed functions,
-- grouped by traceId for a waterfall view.
CREATE TABLE IF NOT EXISTS "TraceSpan" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "deploymentId" TEXT,
    "traceId" TEXT NOT NULL,
    "spanId" TEXT NOT NULL,
    "parentSpanId" TEXT,
    "name" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "status" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TraceSpan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TraceSpan_projectId_traceId_idx" ON "TraceSpan"("projectId", "traceId");
CREATE INDEX IF NOT EXISTS "TraceSpan_projectId_createdAt_idx" ON "TraceSpan"("projectId", "createdAt");

ALTER TABLE "TraceSpan"
  ADD CONSTRAINT "TraceSpan_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
