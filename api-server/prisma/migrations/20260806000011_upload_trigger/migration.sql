-- Deploy without git: a new trigger for prebuilt-archive uploads.
ALTER TYPE "DeployTrigger" ADD VALUE IF NOT EXISTS 'UPLOAD';
