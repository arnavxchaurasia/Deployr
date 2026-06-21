-- CreateTable
CREATE TABLE "LogEvent" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "log" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LogEvent_deploymentId_timestamp_idx" ON "LogEvent"("deploymentId", "timestamp");

-- AddForeignKey
ALTER TABLE "LogEvent" ADD CONSTRAINT "LogEvent_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
