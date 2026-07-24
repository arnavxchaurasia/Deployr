const express = require('express');
const { prisma } = require('../../lib/prisma');
const { decrypt } = require('../../lib/crypto');
const { ecsClient, CLUSTER, TASK, SUBNETS, SECURITY_GROUP, LAMBDA_EXECUTION_ROLE_ARN, RunTaskCommand } = require('../services/awsService');

const router = express.Router();

// POST /hooks/:token  — trigger a deploy without authentication
router.post("/:token", async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || token.length < 32) {
      return res.status(400).json({ error: "Invalid hook token" });
    }

    const project = await prisma.project.findFirst({
      where: { deployHookToken: token },
      include: { environmentVariables: true },
    });

    if (!project) {
      return res.status(404).json({ error: "Hook not found" });
    }

    // Concurrent build guard
    const inFlight = await prisma.deployment.findFirst({
      where: { projectId: project.id, status: { in: ['QUEUED', 'BUILDING'] } },
    });
    if (inFlight) {
      return res.status(409).json({ error: "A build is already in progress", deploymentId: inFlight.id });
    }

    const branch = req.body?.branch || 'main';

    const deployment = await prisma.deployment.create({
      data: {
        projectId: project.id,
        status: 'QUEUED',
        isActive: false,
        branch,
        trigger: 'WEBHOOK',
        startedAt: new Date(),
        isPreview: branch !== 'main' && branch !== 'master',
      },
    });

    const userEnvVarsObj = {};
    for (const e of project.environmentVariables ?? []) {
      if (e.environment === 'all' || e.environment === 'production') {
        userEnvVarsObj[e.key] = decrypt(e.value);
      }
    }

    const command = new RunTaskCommand({
      cluster: CLUSTER,
      taskDefinition: TASK,
      launchType: 'FARGATE',
      networkConfiguration: {
        awsvpcConfiguration: {
          assignPublicIp: 'ENABLED',
          subnets: SUBNETS,
          securityGroups: [SECURITY_GROUP],
        },
      },
      overrides: {
        containerOverrides: [{
          name: 'builder-image',
          environment: [
            { name: 'GIT_REPOSITORY_URL',   value: project.gitURL },
            { name: 'PROJECT_ID',           value: project.id },
            { name: 'DEPLOYEMENT_ID',       value: deployment.id },
            { name: 'BRANCH',               value: branch },
            { name: 'USER_ENV_VARS',        value: JSON.stringify(userEnvVarsObj) },
            { name: 'AWS_LAMBDA_ROLE_ARN',  value: LAMBDA_EXECUTION_ROLE_ARN },
            { name: 'BUILD_COMMAND',        value: project.buildCommand   || 'npm run build' },
            { name: 'OUTPUT_DIR',           value: project.outputDir      || 'dist' },
            { name: 'INSTALL_COMMAND',      value: project.installCommand || 'npm install' },
            { name: 'ROOT_DIR',             value: project.rootDir        || '.' },
          ],
        }],
      },
    });

    try {
      const result = await ecsClient.send(command);
      const taskArn = result.tasks?.[0]?.taskArn;
      if (taskArn) {
        await prisma.deployment.update({ where: { id: deployment.id }, data: { taskArn } });
      }
    } catch (ecsErr) {
      console.error('[Hook] ECS launch failed:', ecsErr);
      await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'FAILED' } });
      return res.status(500).json({ error: "Failed to launch build" });
    }

    res.json({ success: true, deploymentId: deployment.id });
  } catch (err) {
    console.error('[Hook] Error:', err);
    res.status(500).json({ error: "Hook failed" });
  }
});

module.exports = router;