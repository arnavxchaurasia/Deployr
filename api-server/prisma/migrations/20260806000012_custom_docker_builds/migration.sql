-- Custom Docker-based builds via AWS CodeBuild (Fargate can't run
-- Docker-in-Docker, so this dispatches to CodeBuild instead of ECS).
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "use_dockerfile" BOOLEAN NOT NULL DEFAULT false;
