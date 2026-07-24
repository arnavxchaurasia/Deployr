const express = require('express');
const { z } = require('zod');
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { logEvent } = require('../services/auditService');
const { rateLimit } = require('../middlewares/rateLimitMiddleware');
const { encrypt, decrypt } = require('../../lib/crypto');
const crypto = require('crypto');
const { ecsClient, CLUSTER, TASK, SUBNETS, SECURITY_GROUP, LAMBDA_EXECUTION_ROLE_ARN, RunTaskCommand, StopTaskCommand } = require('../services/awsService');
const mailService = require('../services/mailService');
const { sendNotifyWebhook } = require('../services/notifyWebhookService');

const APP_URL = process.env.APP_URL || 'http://localhost:8000';
const FRONTEND_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const S3_BUCKET = process.env.S3_BUCKET || 'vercel-clone-ws';

async function deleteS3Prefix(prefix) {
  const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
  let continuationToken;
  do {
    const listed = await s3.send(new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    if (listed.Contents?.length) {
      await s3.send(new DeleteObjectsCommand({
        Bucket: S3_BUCKET,
        Delete: { Objects: listed.Contents.map(obj => ({ Key: obj.Key })) },
      }));
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
}

function slugifyBranch(branch) {
  return branch.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const router = express.Router();

router.post("/internal/deployments/:id/status", async (req, res) => {
  try {
    const secret = req.headers["x-internal-secret"];
    const expected = process.env.INTERNAL_SECRET;

    if (!expected || !secret || !crypto.timingSafeEqual(
      Buffer.from(secret),
      Buffer.from(expected)
    )) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { status } = req.body;
    const deploymentId = req.params.id;

    const allowed = ["QUEUED", "BUILDING", "READY", "FAILED"];

    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const deployment = await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status,
        ...(status === "READY" || status === "FAILED" ? { finishedAt: new Date() } : {}),
      },
      include: {
        project: {
          include: { user: true }
        }
      }
    });

    const project = deployment.project;

    if (status === "READY" && project?.user?.email) {
      const url = `${APP_URL}/?project=${project.subDomain}`;
      await mailService.sendDeploymentSuccessEmail(project.user.email, project.name, deployment.id, url).catch(console.error);
    } else if (status === "FAILED" && project?.user?.email) {
      const logsUrl = `${FRONTEND_URL}/dashboard/logs/${deployment.id}`;
      await mailService.sendDeploymentFailureEmail(project.user.email, project.name, deployment.id, logsUrl).catch(console.error);
    }

    // Fire notification webhook (non-blocking)
    if ((status === "READY" || status === "FAILED") && project?.notifyWebhookUrl) {
      sendNotifyWebhook(project.notifyWebhookUrl, {
        event: status === "READY" ? "deployment.succeeded" : "deployment.failed",
        deploymentId: deployment.id,
        projectName: project.name,
        branch: deployment.branch,
        trigger: deployment.trigger,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    }

    res.json({ success: true, data: deployment });
  } catch (err) {
    console.error("Status update error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

router.post("/deploy", authMiddleware, async (req, res) => {
  try {
    const { projectId, branch } = req.body;
    if (!projectId) return res.status(400).json({ error: "projectId required" });

    const deployBranch = branch || "main";

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.user.id },
      include: { environmentVariables: true },
    });

    if (!project) return res.status(404).json({ error: "Project not found" });

    // Rate limit: 10 deploys per user per minute
    const ip = req.headers['x-forwarded-for'] || req.ip;
    if (!(await rateLimit(`deploy-${req.user.id}-${ip}`, 10, 60_000))) {
      return res.status(429).json({ error: "Too many deploy requests. Slow down." });
    }

    // Email must be verified before deploying
    if (!req.user.emailVerified) {
      return res.status(403).json({ error: "Please verify your email address before deploying." });
    }

    // Concurrent build guard — prevent multiple simultaneous builds
    const inFlight = await prisma.deployment.findFirst({
      where: { projectId: project.id, status: { in: ["QUEUED", "BUILDING"] } },
    });
    if (inFlight) {
      return res.status(409).json({
        error: "A build is already in progress for this project.",
        deploymentId: inFlight.id,
        status: inFlight.status,
      });
    }

    // Enforce deployment retention limit (default 3, configurable per project)
    const retentionCount = project.deploymentRetentionCount ?? 3;

    const allDeployments = await prisma.deployment.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    let warning;
    if (allDeployments.length >= retentionCount) {
      const toDelete = allDeployments.slice(retentionCount - 1);
      for (const dep of toDelete) {
        await deleteS3Prefix(`__outputs/${project.id}/${dep.id}/`);
        await prisma.deployment.delete({ where: { id: dep.id } });
      }
      if (toDelete.length > 0) {
        warning = `${toDelete.length} oldest deployment(s) removed to stay within your retention limit (${retentionCount}).`;
      }
    }

    // Generate preview subdomain for non-main branches
    const isPreview = deployBranch !== "main";
    let previewSubdomain = null;
    if (isPreview) {
      const branchSlug = slugifyBranch(deployBranch);
      previewSubdomain = `${project.slug}-${branchSlug}`.slice(0, 63);
      // Ensure uniqueness — if another deployment owns this subdomain, null it out there first
      await prisma.deployment.updateMany({
        where: { projectId: project.id, previewSubdomain },
        data: { previewSubdomain: null },
      });
    }

    const deployment = await prisma.deployment.create({
      data: {
        projectId: project.id,
        status: "QUEUED",
        isActive: false,
        branch: deployBranch,
        trigger: "MANUAL",
        startedAt: new Date(),
        isPreview,
        previewSubdomain,
      },
    });

    // Filter env vars by environment: "all" always applies; "production"/"preview" per branch
    const targetEnv = isPreview ? 'preview' : 'production';
    const userEnvVarsObj = {};
    for (const e of project.environmentVariables ?? []) {
      if (e.environment === 'all' || e.environment === targetEnv) {
        userEnvVarsObj[e.key] = decrypt(e.value);
      }
    }

    const command = new RunTaskCommand({
      cluster: CLUSTER,
      taskDefinition: TASK,
      launchType: "FARGATE",
      networkConfiguration: {
        awsvpcConfiguration: {
          assignPublicIp: "ENABLED",
          subnets: SUBNETS,
          securityGroups: [SECURITY_GROUP],
        },
      },
      overrides: {
        containerOverrides: [
          {
            name: "builder-image",
            environment: [
              { name: "GIT_REPOSITORY_URL",  value: project.gitURL },
              { name: "PROJECT_ID",          value: project.id },
              { name: "DEPLOYEMENT_ID",      value: deployment.id },
              { name: "BRANCH",              value: deployBranch },
              { name: "USER_ENV_VARS",       value: JSON.stringify(userEnvVarsObj) },
              { name: "AWS_LAMBDA_ROLE_ARN", value: LAMBDA_EXECUTION_ROLE_ARN },
              { name: "BUILD_COMMAND",       value: project.buildCommand   || "npm run build" },
              { name: "OUTPUT_DIR",          value: project.outputDir      || "dist" },
              { name: "INSTALL_COMMAND",     value: project.installCommand || "npm install" },
              { name: "ROOT_DIR",            value: project.rootDir        || "." },
              { name: "PROJECT_SLUG",        value: project.slug },
            ],
          },
        ],
      },
    });

    const result = await ecsClient.send(command);
    const taskArn = result.tasks?.[0]?.taskArn;

    if (taskArn) {
      await prisma.deployment.update({
        where: { id: deployment.id },
        data: { taskArn },
      });
    }

    logEvent(req.user.id, 'deployment.triggered', {
      projectId: project.id,
      projectName: project.name,
      meta: { branch: deployBranch, trigger: 'MANUAL', deploymentId: deployment.id },
    });

    res.json({
      data: deployment,
      warning: warning ?? null,
    });
  } catch (err) {
    console.error("Deploy error:", err);
    res.status(500).json({ error: "Deploy failed" });
  }
});

router.post("/deployments/:id/promote", authMiddleware, async (req, res) => {
  try {
    const deploymentId = req.params.id;

    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: { project: true },
    });

    if (!deployment || deployment.project.userId !== req.user.id) {
      return res.status(404).json({ error: "Not found" });
    }

    if (deployment.status !== "READY") {
      return res.status(400).json({
        error: "Only READY deployments can be promoted",
      });
    }

    await prisma.$transaction([
      prisma.deployment.updateMany({
        where: { projectId: deployment.projectId },
        data: { isActive: false },
      }),
      prisma.deployment.update({
        where: { id: deployment.id },
        data: { isActive: true },
      }),
      prisma.project.update({
        where: { id: deployment.projectId },
        data: {
          latestDeploymentId: deployment.id,
          lastDeployedAt: new Date(),
          deployedAt: deployment.project.deployedAt ?? new Date(),
          isPublished: true,
        },
      }),
    ]);

    logEvent(req.user.id, deployment.isPreview ? 'deployment.promoted' : 'deployment.rolled_back', {
      projectId: deployment.projectId,
      projectName: deployment.project.name,
      meta: { deploymentId: deployment.id, branch: deployment.branch },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Promote error:", err);
    res.status(500).json({ error: "Failed to promote deployment" });
  }
});

router.post("/deployments/:id/cancel", authMiddleware, async (req, res) => {
  try {
    const deployment = await prisma.deployment.findUnique({
      where: { id: req.params.id },
      include: { project: true },
    });

    if (!deployment || deployment.project.userId !== req.user.id) {
      return res.status(404).json({ error: "Not found" });
    }

    if (!["QUEUED", "BUILDING"].includes(deployment.status)) {
      return res.status(400).json({ error: "Only in-progress deployments can be cancelled" });
    }

    // Stop the ECS task if one is running
    if (deployment.taskArn) {
      try {
        await ecsClient.send(new StopTaskCommand({
          cluster: CLUSTER,
          task: deployment.taskArn,
          reason: "Cancelled by user",
        }));
      } catch (ecsErr) {
        console.warn("[Cancel] ECS stop failed (task may have already stopped):", ecsErr.message);
      }
    }

    await prisma.deployment.update({
      where: { id: deployment.id },
      data: { status: "FAILED" },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Cancel error:", err);
    res.status(500).json({ error: "Failed to cancel deployment" });
  }
});

router.delete("/deployments/:id", authMiddleware, async (req, res) => {
  const deploymentId = req.params.id;

  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    include: { project: true },
  });

  if (!deployment || deployment.project.userId !== req.user.id) {
    return res.status(404).json({ error: "Not found" });
  }

  await deleteS3Prefix(`__outputs/${deployment.projectId}/${deployment.id}/`);
  await prisma.deployment.delete({ where: { id: deployment.id } });

  res.json({ success: true });
});

router.get("/logs/:id", authMiddleware, async (req, res) => {
  try {
    const deploymentId = req.params.id;

    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: {
        project: { select: { userId: true } },
      },
    });

    if (!deployment || deployment.project.userId !== req.user.id) {
      return res.status(404).json({ error: "Not found" });
    }

    const rows = await prisma.logEvent.findMany({
      where: { deploymentId },
      orderBy: { timestamp: "asc" },
      select: { log: true, timestamp: true },
    });

    res.json({
      logs: rows.map(r => ({
        log: r.log,
        timestamp: r.timestamp.toISOString(),
      })),
      cursor: rows.length > 0 ? rows[rows.length - 1].timestamp.toISOString() : null,
    });
  } catch (err) {
    console.error("Fetch logs error:", err);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

router.get("/deployment/:id", authMiddleware, async (req, res) => {
  try {
    const deployment = await prisma.deployment.findUnique({
      where: { id: req.params.id },
      include: {
        project: { select: { userId: true, id: true } },
      },
    });

    if (!deployment || deployment.project.userId !== req.user.id) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json({
      data: {
        id: deployment.id,
        status: deployment.status,
        isProduction: deployment.isActive === true,
        projectId: deployment.project.id,
      },
    });
  } catch (err) {
    console.error("Fetch deployment error:", err);
    res.status(500).json({ error: "Failed to fetch deployment" });
  }
});

module.exports = router;