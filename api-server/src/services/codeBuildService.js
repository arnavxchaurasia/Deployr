'use strict';

const { CodeBuildClient, StartBuildCommand } = require('@aws-sdk/client-codebuild');

// Custom Docker-based builds — a project can supply its own Dockerfile
// instead of using the fixed install/build pipeline in server/script.js.
//
// This dispatches to AWS CodeBuild rather than the same ECS Fargate task
// used for normal builds, because Fargate does not support privileged
// containers and therefore cannot run `docker build` (Docker-in-Docker)
// itself. CodeBuild supports privileged mode natively and is the standard
// way to build Docker images without managing your own EC2-backed builder
// fleet.
//
// Requires the operator to create the CodeBuild project themselves (one-time
// manual AWS setup, same pattern as the GitHub App / Cloudflare SSL
// integrations elsewhere in this codebase) — privileged mode enabled, and a
// buildspec that builds the Dockerfile, runs the resulting image, and
// uploads its output the same way server/script.js does (see
// server/docker-buildspec.yml for a starting template and the exact
// contract it needs to fulfill). Set CODEBUILD_PROJECT_NAME once that
// project exists.

const CODEBUILD_PROJECT_NAME = process.env.CODEBUILD_PROJECT_NAME;

const codeBuildClient = new CodeBuildClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

function isConfigured() {
  return Boolean(CODEBUILD_PROJECT_NAME);
}

/**
 * Start a CodeBuild run for a Dockerfile-based project. envVars is an array
 * of { name, value } pairs, same shape as the ECS container overrides used
 * for normal builds — CodeBuild's buildspec is expected to read the same
 * variable names (GIT_REPOSITORY_URL, PROJECT_ID, DEPLOYEMENT_ID, etc.).
 *
 * @returns {Promise<string|null>} the CodeBuild build ID, or null on failure
 */
async function startDockerBuild(envVars) {
  if (!isConfigured()) {
    throw new Error('CODEBUILD_PROJECT_NAME is not configured — Docker builds are unavailable until the operator sets up a CodeBuild project');
  }

  const result = await codeBuildClient.send(new StartBuildCommand({
    projectName: CODEBUILD_PROJECT_NAME,
    environmentVariablesOverride: envVars.map((e) => ({ name: e.name, value: e.value, type: 'PLAINTEXT' })),
  }));

  return result.build?.id ?? null;
}

module.exports = { isConfigured, startDockerBuild, codeBuildClient };
