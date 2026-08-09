-- Bundle output size (bytes), for build-performance regression detection.
ALTER TABLE "DeploymentSignal" ADD COLUMN IF NOT EXISTS "bundleSizeBytes" INTEGER;
