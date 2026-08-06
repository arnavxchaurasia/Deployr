'use strict';

const { prisma } = require('../../lib/prisma');
const { decrypt } = require('../../lib/crypto');
const logger = require('../../lib/logger');
const { getRegionConfig, RunTaskCommand } = require('./awsService');
const codeBuildService = require('./codeBuildService');
const { provisionPreviewDatabase } = require('./previewDatabaseService');
const { buildIntegrationEnvVars } = require('./integrationsService');

// Shared by every VCS webhook handler (GitHub, GitLab, Bitbucket) so a push
// or PR/MR event from any provider triggers the same ECS build pipeline.

function slugifyBranch(branch) {
  return branch.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function buildUserEnvVars(project, targetEnv) {
  const userEnvVarsObj = {};
  for (const e of project.environmentVariables ?? []) {
    if (e.environment === 'all' || e.environment === targetEnv) {
      userEnvVarsObj[e.key] = decrypt(e.value);
    }
  }
  // Enabled marketplace connectors (Slack/Sentry/Datadog/...) inject their
  // own env vars too — a real environment variable with the same key always
  // wins, since a user explicitly setting one is more specific than the
  // connector default. (snapshot before merging: target and the "restore
  // precedence" source can't be the same object reference, or it's a no-op)
  const explicitEnvVars = { ...userEnvVarsObj };
  Object.assign(userEnvVarsObj, buildIntegrationEnvVars(project.integrations), explicitEnvVars);
  return userEnvVarsObj;
}

async function runBuildTask(deployment, regionConfig, extraEnv) {
  const command = new RunTaskCommand({
    cluster: regionConfig.CLUSTER,
    taskDefinition: regionConfig.TASK,
    launchType: 'FARGATE',
    networkConfiguration: {
      awsvpcConfiguration: {
        assignPublicIp: 'ENABLED',
        subnets: regionConfig.SUBNETS,
        securityGroups: [regionConfig.SECURITY_GROUP],
      },
    },
    overrides: {
      containerOverrides: [
        {
          name: 'builder-image',
          environment: extraEnv,
        },
      ],
    },
  });

  try {
    const result = await regionConfig.ecsClient.send(command);
    const taskArn = result.tasks?.[0]?.taskArn;
    if (taskArn) {
      await prisma.deployment.update({ where: { id: deployment.id }, data: { taskArn } });
    }
  } catch (ecsErr) {
    logger.error({ err: ecsErr }, '[Deploy] ECS task failed');
    await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'FAILED' } });
  }
}

async function triggerECSBuild({ project, branch, commitHash, trigger, prNumber = null }) {
  const isPreview = branch !== 'main' && branch !== 'master';
  let previewSubdomain = null;

  if (isPreview) {
    const branchSlug = slugifyBranch(branch);
    previewSubdomain = `${project.slug}-${branchSlug}`.slice(0, 63);
    // Clear any old deployment that owned this subdomain
    await prisma.deployment.updateMany({
      where: { projectId: project.id, previewSubdomain },
      data: { previewSubdomain: null },
    });
  }

  const regionConfig = getRegionConfig(project.region);

  const deployment = await prisma.deployment.create({
    data: {
      projectId: project.id,
      status: 'QUEUED',
      isActive: false,
      branch,
      commitHash: commitHash || null,
      trigger,
      startedAt: new Date(),
      isPreview,
      previewSubdomain,
      prNumber,
      region: regionConfig.region,
    },
  });

  const userEnvVarsObj = buildUserEnvVars(project, isPreview ? 'preview' : 'production');

  // Ephemeral preview databases: only for previews, and only if the project
  // has a provisioning webhook configured. Awaited — the build needs the
  // connection string before it starts, but a provisioning failure never
  // blocks the deploy (see previewDatabaseService.js).
  if (isPreview && project.previewDbProvisionWebhookUrl) {
    const db = await provisionPreviewDatabase(project.previewDbProvisionWebhookUrl, {
      projectId: project.id, deploymentId: deployment.id, branch,
    });
    if (db) userEnvVarsObj[db.envVar] = db.value;
  }

  const envVars = [
    { name: 'GIT_REPOSITORY_URL',  value: project.gitURL },
    { name: 'PROJECT_ID',          value: project.id },
    { name: 'DEPLOYEMENT_ID',      value: deployment.id },
    { name: 'BRANCH',              value: branch },
    { name: 'USER_ENV_VARS',       value: JSON.stringify(userEnvVarsObj) },
    { name: 'AWS_LAMBDA_ROLE_ARN', value: regionConfig.LAMBDA_EXECUTION_ROLE_ARN },
    { name: 'AWS_REGION',          value: regionConfig.region },
    { name: 'BUILD_COMMAND',       value: project.buildCommand   || 'npm run build' },
    { name: 'OUTPUT_DIR',          value: project.outputDir      || 'dist' },
    { name: 'INSTALL_COMMAND',     value: project.installCommand || 'npm install' },
    { name: 'ROOT_DIR',            value: project.rootDir        || '.' },
  ];

  // Custom Docker-based builds dispatch to CodeBuild instead of the ECS
  // Fargate task — Fargate can't run Docker-in-Docker. Every existing
  // caller (GitHub/GitLab/Bitbucket webhooks, manual redeploy) gets this
  // for free since it's centralized here rather than duplicated per caller.
  if (project.useDockerfile) {
    if (!codeBuildService.isConfigured()) {
      await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'FAILED' } });
      logger.error(`[Deploy] Project ${project.id} has useDockerfile enabled but CODEBUILD_PROJECT_NAME isn't configured`);
      return deployment;
    }
    try {
      const buildId = await codeBuildService.startDockerBuild(envVars);
      if (buildId) {
        await prisma.deployment.update({ where: { id: deployment.id }, data: { taskArn: buildId } });
      }
    } catch (err) {
      logger.error({ err }, '[Deploy] CodeBuild start failed');
      await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'FAILED' } });
    }
    return deployment;
  }

  await runBuildTask(deployment, regionConfig, envVars);

  return deployment;
}

/**
 * Deploy without git: the archive at archiveS3Key (a .tar.gz already
 * uploaded to the build bucket, see deploymentRoutes.js's upload endpoint)
 * is extracted directly instead of a git clone, and the install/build steps
 * are skipped entirely — the archive is treated as already-built output.
 */
async function triggerUploadBuild({ project, archiveS3Key }) {
  const regionConfig = getRegionConfig(project.region);

  const deployment = await prisma.deployment.create({
    data: {
      projectId: project.id,
      status: 'QUEUED',
      isActive: false,
      branch: null,
      trigger: 'UPLOAD',
      startedAt: new Date(),
      isPreview: false,
      region: regionConfig.region,
    },
  });

  const userEnvVarsObj = buildUserEnvVars(project, 'production');

  await runBuildTask(deployment, regionConfig, [
    { name: 'PREBUILT_ARCHIVE_S3_KEY', value: archiveS3Key },
    { name: 'PROJECT_ID',              value: project.id },
    { name: 'DEPLOYEMENT_ID',          value: deployment.id },
    { name: 'USER_ENV_VARS',           value: JSON.stringify(userEnvVarsObj) },
    { name: 'AWS_LAMBDA_ROLE_ARN',     value: regionConfig.LAMBDA_EXECUTION_ROLE_ARN },
    { name: 'AWS_REGION',              value: regionConfig.region },
    { name: 'OUTPUT_DIR',              value: project.outputDir || '.' },
  ]);

  return deployment;
}

module.exports = { triggerECSBuild, triggerUploadBuild, slugifyBranch };
