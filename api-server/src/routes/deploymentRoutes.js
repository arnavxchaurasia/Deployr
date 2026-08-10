const express = require('express');
const { z } = require('zod');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { logEvent } = require('../services/auditService');
const { rateLimit } = require('../middlewares/rateLimitMiddleware');
const { encrypt, decrypt } = require('../../lib/crypto');
const crypto = require('crypto');
const multer = require('multer');
const { ecsClient, CLUSTER, TASK, SUBNETS, SECURITY_GROUP, LAMBDA_EXECUTION_ROLE_ARN, RunTaskCommand, StopTaskCommand, s3Client, PutObjectCommand, S3_BUCKET } = require('../services/awsService');
const { triggerUploadBuild } = require('../services/deployTriggerService');
const { checkBlackout } = require('../services/blackoutService');
const { StopBuildCommand } = require('@aws-sdk/client-codebuild');
const { codeBuildClient } = require('../services/codeBuildService');
const mailService = require('../services/mailService');
const { sendNotifyWebhook } = require('../services/notifyWebhookService');
const { subscribe } = require('../utils/logBus');
const { checkBuildQuota } = require('../services/quotaService');
const { requireProjectAccess, projectAccessWhere } = require('../services/projectAccessService');
const { cleanupDeployment } = require('../services/deploymentCleanupService');
const { buildIntegrationEnvVars } = require('../services/integrationsService');
const { getProjectEnvGroupVars } = require('../services/envGroupService');
const { getProjectStorageAddonVars } = require('../services/storageAddonService');
const { rejectApprovedDeployment } = require('../services/kafkaService');

const APP_URL = process.env.APP_URL || 'http://localhost:8000';
const FRONTEND_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

function slugifyBranch(branch) {
  return branch.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const router = express.Router();

// In-memory buffer is fine — archives are capped well below Node's default
// heap pressure point, and this is a rare, low-concurrency action.
const uploadArchive = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

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

    // Real-time Slack notification via integrations
    if (status === 'READY' || status === 'FAILED') {
      try {
        const { getProjectSlackWebhook } = require('../services/integrationsService');
        const slackWebhookUrl = await getProjectSlackWebhook(project.id);
        if (slackWebhookUrl) {
          const emoji = status === 'READY' ? '✅' : '❌';
          const text = status === 'READY'
            ? `${emoji} *${project.name}* deployed successfully`
            : `${emoji} *${project.name}* deployment failed`;
          await fetch(slackWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, username: 'Deployr', icon_emoji: ':rocket:' }),
          }).catch(() => {});
        }
      } catch (e) { /* non-fatal */ }
    }

    // Update PR comment with live preview URL
    if ((status === 'READY' || status === 'FAILED') && deployment.prCommentId && deployment.prNumber) {
      try {
        const { Octokit } = await import('@octokit/rest');
        const octokit = new Octokit({ auth: deployment.project?.user?.githubToken });
        const previewUrl = deployment.previewSubdomain
          ? `https://${deployment.previewSubdomain}.${process.env.BASE_DOMAIN || 'deployr.app'}`
          : deployment.functionUrl;
        const body = status === 'READY'
          ? `✅ **Preview ready**: [${previewUrl}](${previewUrl})\n\nBranch: \`${deployment.branch}\` · Deployment: \`${deployment.id.slice(0, 8)}\``
          : `❌ **Preview build failed** for branch \`${deployment.branch}\`\n\n[View logs](${process.env.NEXTAUTH_URL}/dashboard/logs/${deployment.id})`;
        await octokit.rest.issues.updateComment({
          owner: deployment.project.githubOwner,
          repo: deployment.project.githubRepo,
          comment_id: parseInt(deployment.prCommentId),
          body,
        });
      } catch (e) { /* non-fatal */ }
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
      where: { id: projectId, ...projectAccessWhere(req.user.id, 'MEMBER') },
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

    // Enforce monthly build-minute quota for the project's plan (org plan
    // for org-owned projects, otherwise the owner's personal plan)
    const quota = await checkBuildQuota({ userId: project.userId, orgId: project.orgId });
    if (!quota.allowed) {
      return res.status(402).json({
        error: `Monthly build-minute quota exceeded (${Math.round(quota.used)}/${quota.limit} min on the ${quota.plan} plan). Upgrade your plan to keep deploying.`,
        quota,
      });
    }

    // Deployment blackout window — rejects the request outright rather than
    // queuing it for later, so the caller (CI, a person) knows immediately.
    const blackout = checkBlackout(project);
    if (blackout.blocked) {
      return res.status(423).json({
        error: "Deploys are blocked during this project's configured blackout window.",
        window: blackout.window,
      });
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
      select: { id: true, projectId: true, functionUrl: true, functionUrls: true, region: true },
    });

    let warning;
    if (allDeployments.length >= retentionCount) {
      const toDelete = allDeployments.slice(retentionCount - 1);
      for (const dep of toDelete) {
        await cleanupDeployment(dep);
      }
      if (toDelete.length > 0) {
        warning = `${toDelete.length} oldest deployment(s) removed to stay within your retention limit (${retentionCount}).`;
      }
    }

    // Staging takes precedence over the preview classification — it's a
    // persistent named branch, not a PR/feature branch.
    const isStaging = !!project.stagingBranch && deployBranch === project.stagingBranch;

    // Generate preview subdomain for non-main/master branches — matches
    // deployTriggerService.js's webhook-path classification exactly, so a
    // "master"-branch project isn't misclassified as a preview when
    // deployed manually but correctly classified via webhook.
    const isPreview = !isStaging && deployBranch !== "main" && deployBranch !== "master";
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
        isStaging,
        previewSubdomain,
      },
    });

    // Filter env vars by environment: "all" always applies; "production"/"preview"/"staging" per branch
    const targetEnv = isStaging ? 'staging' : isPreview ? 'preview' : 'production';
    const userEnvVarsObj = {};
    for (const e of project.environmentVariables ?? []) {
      if (e.environment === 'all' || e.environment === targetEnv) {
        userEnvVarsObj[e.key] = decrypt(e.value);
      }
    }
    // Precedence, lowest to highest: shared EnvGroup vars < marketplace
    // connector vars (Slack/Sentry/Datadog/...) < this project's own
    // explicit env vars. (snapshot before merging: target and the "restore
    // precedence" source can't be the same object reference, or the restore
    // is a no-op)
    const explicitEnvVars = { ...userEnvVarsObj };
    const [groupEnvVars, storageAddonVars] = await Promise.all([
      getProjectEnvGroupVars(project.id),
      getProjectStorageAddonVars(project.id),
    ]);
    Object.assign(userEnvVarsObj, groupEnvVars, storageAddonVars, buildIntegrationEnvVars(project.integrations), explicitEnvVars);

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

// POST /project/:id/deploy/upload — deploy without git: a prebuilt
// tar.gz (a static site's build output, or a Next.js standalone dir) is
// uploaded directly and deployed as-is, skipping clone/install/build
// entirely (see triggerUploadBuild + server/script.js's PREBUILT_ARCHIVE_S3_KEY
// branch).
router.post("/project/:id/deploy/upload", authMiddleware, uploadArchive.single('archive'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "archive file is required (field name: archive)" });
    if (!/\.(tar\.gz|tgz)$/i.test(req.file.originalname || '')) {
      return res.status(400).json({ error: "archive must be a .tar.gz or .tgz file" });
    }

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'MEMBER') },
      include: { environmentVariables: true },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const ip = req.headers['x-forwarded-for'] || req.ip;
    if (!(await rateLimit(`deploy-${req.user.id}-${ip}`, 10, 60_000))) {
      return res.status(429).json({ error: "Too many deploy requests. Slow down." });
    }
    if (!req.user.emailVerified) {
      return res.status(403).json({ error: "Please verify your email address before deploying." });
    }

    const quota = await checkBuildQuota({ userId: project.userId, orgId: project.orgId });
    if (!quota.allowed) {
      return res.status(402).json({
        error: `Monthly build-minute quota exceeded (${Math.round(quota.used)}/${quota.limit} min on the ${quota.plan} plan). Upgrade your plan to keep deploying.`,
        quota,
      });
    }

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

    const archiveS3Key = `__uploads/${project.id}/${crypto.randomUUID()}.tar.gz`;
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: archiveS3Key,
      Body: req.file.buffer,
      ContentType: 'application/gzip',
    }));

    const deployment = await triggerUploadBuild({ project, archiveS3Key });

    logEvent(req.user.id, 'deployment.triggered', {
      projectId: project.id,
      projectName: project.name,
      meta: { trigger: 'UPLOAD', deploymentId: deployment.id },
    });

    res.json({ data: deployment });
  } catch (err) {
    console.error("Upload deploy error:", err);
    res.status(500).json({ error: "Upload deploy failed" });
  }
});

router.post("/deployments/:id/promote", authMiddleware, async (req, res) => {
  try {
    const deploymentId = req.params.id;

    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: { project: true },
    });

    if (!deployment || !(await requireProjectAccess(req.user.id, deployment.projectId, 'ADMIN'))) {
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
        // Also clears the requireApproval hold, if this deployment was
        // sitting behind one (see kafkaService.js) — manually promoting it
        // is exactly the approval action, so there's no separate "approve"
        // endpoint duplicating this.
        data: { isActive: true, awaitingApproval: false },
      }),
      prisma.project.update({
        where: { id: deployment.projectId },
        data: {
          latestDeploymentId: deployment.id,
          lastDeployedAt: new Date(),
          deployedAt: deployment.project.deployedAt ?? new Date(),
          isPublished: true,
          // A full promote supersedes any in-progress canary rollout.
          canaryDeploymentId: null,
          canaryPercent: 0,
        },
      }),
    ]);

    logEvent(req.user.id, deployment.awaitingApproval ? 'deployment.approved' : deployment.isPreview ? 'deployment.promoted' : 'deployment.rolled_back', {
      projectId: deployment.projectId,
      projectName: deployment.project.name,
      meta: { deploymentId: deployment.id, branch: deployment.branch },
    });

    if (deployment.awaitingApproval && deployment.project?.notifyWebhookUrl) {
      sendNotifyWebhook(deployment.project.notifyWebhookUrl, {
        event: "deployment.succeeded",
        deploymentId: deployment.id,
        projectName: deployment.project.name,
        branch: deployment.branch,
        trigger: deployment.trigger,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Promote error:", err);
    res.status(500).json({ error: "Failed to promote deployment" });
  }
});

// POST /project/:id/canary — start or adjust a canary rollout. Routes
// `percent` of traffic to `deploymentId` while the current active
// deployment keeps serving the rest, so a candidate can be validated on
// live traffic before a full promote (see /deployments/:id/promote, which
// also clears any in-progress canary).
router.post("/project/:id/canary", authMiddleware, async (req, res) => {
  try {
    const projectId = req.params.id;
    const access = await requireProjectAccess(req.user.id, projectId, 'ADMIN');
    if (!access) return res.status(404).json({ error: "Not found" });

    const schema = z.object({
      deploymentId: z.string(),
      percent: z.number().int().min(1).max(99),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const canaryDeployment = await prisma.deployment.findFirst({
      where: { id: parsed.data.deploymentId, projectId, status: "READY" },
    });
    if (!canaryDeployment) {
      return res.status(400).json({ error: "Deployment must belong to this project and be READY" });
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { canaryDeploymentId: canaryDeployment.id, canaryPercent: parsed.data.percent },
    });

    logEvent(req.user.id, 'canary.started', {
      projectId,
      meta: { deploymentId: canaryDeployment.id, percent: parsed.data.percent },
    });

    res.json({ success: true, canaryDeploymentId: canaryDeployment.id, canaryPercent: parsed.data.percent });
  } catch (err) {
    console.error("Canary start error:", err);
    res.status(500).json({ error: "Failed to start canary rollout" });
  }
});

// DELETE /project/:id/canary — abort a canary rollout, reverting to 100%
// on the existing active deployment.
router.delete("/project/:id/canary", authMiddleware, async (req, res) => {
  try {
    const projectId = req.params.id;
    const access = await requireProjectAccess(req.user.id, projectId, 'ADMIN');
    if (!access) return res.status(404).json({ error: "Not found" });

    await prisma.project.update({
      where: { id: projectId },
      data: { canaryDeploymentId: null, canaryPercent: 0 },
    });

    logEvent(req.user.id, 'canary.aborted', { projectId });
    res.json({ success: true });
  } catch (err) {
    console.error("Canary abort error:", err);
    res.status(500).json({ error: "Failed to abort canary rollout" });
  }
});

router.post("/deployments/:id/cancel", authMiddleware, async (req, res) => {
  try {
    const deployment = await prisma.deployment.findUnique({
      where: { id: req.params.id },
      include: { project: true },
    });

    if (!deployment || !(await requireProjectAccess(req.user.id, deployment.projectId, 'MEMBER'))) {
      return res.status(404).json({ error: "Not found" });
    }

    if (!["QUEUED", "BUILDING"].includes(deployment.status)) {
      return res.status(400).json({ error: "Only in-progress deployments can be cancelled" });
    }

    // Stop the running build — CodeBuild for Dockerfile-based projects (see
    // deployTriggerService.js, which stores the CodeBuild build ID in the
    // same taskArn field), otherwise the ECS Fargate task.
    if (deployment.taskArn) {
      try {
        if (deployment.project?.useDockerfile) {
          await codeBuildClient.send(new StopBuildCommand({ id: deployment.taskArn }));
        } else {
          await ecsClient.send(new StopTaskCommand({
            cluster: CLUSTER,
            task: deployment.taskArn,
            reason: "Cancelled by user",
          }));
        }
      } catch (ecsErr) {
        console.warn("[Cancel] Build stop failed (task may have already stopped):", ecsErr.message);
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

  if (!deployment || !(await requireProjectAccess(req.user.id, deployment.projectId, 'ADMIN'))) {
    return res.status(404).json({ error: "Not found" });
  }

  await cleanupDeployment(deployment);

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

    if (!deployment || !(await requireProjectAccess(req.user.id, deployment.projectId, 'MEMBER'))) {
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

// GET /logs/:id/stream — Server-Sent Events tail of build/runtime logs.
// Replays everything persisted so far, then streams new lines live until the
// deployment reaches a terminal status (or the client disconnects).
router.get("/logs/:id/stream", authMiddleware, async (req, res) => {
  const deploymentId = req.params.id;

  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: { id: true, status: true, project: { select: { userId: true } } },
  });

  if (!deployment || !(await requireProjectAccess(req.user.id, deployment.projectId, 'MEMBER'))) {
    return res.status(404).json({ error: "Not found" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const backlog = await prisma.logEvent.findMany({
    where: { deploymentId },
    orderBy: { timestamp: "asc" },
    select: { log: true, timestamp: true },
  });

  for (const row of backlog) {
    send("log", { log: row.log, timestamp: row.timestamp.toISOString() });
  }

  if (deployment.status === "READY" || deployment.status === "FAILED") {
    send("status", { status: deployment.status });
    return res.end();
  }

  const heartbeat = setInterval(() => res.write(":\n\n"), 15000);

  const unsubscribe = subscribe(deploymentId, (msg) => {
    if (msg.type === "log") {
      send("log", { log: msg.log, timestamp: msg.timestamp });
    } else if (msg.type === "status") {
      send("status", { status: msg.status });
      cleanup();
      res.end();
    }
  });

  function cleanup() {
    clearInterval(heartbeat);
    unsubscribe();
  }

  req.on("close", cleanup);
});

// POST /deployments/:id/reject — reject a deployment awaiting approval; it
// never goes live and is marked FAILED.
router.post("/deployments/:id/reject", authMiddleware, async (req, res) => {
  try {
    const deployment = await prisma.deployment.findUnique({ where: { id: req.params.id }, select: { projectId: true } });
    if (!deployment) return res.status(404).json({ error: "Not found" });

    const access = await requireProjectAccess(req.user.id, deployment.projectId, 'ADMIN');
    if (!access) return res.status(403).json({ error: "Forbidden" });

    const rejected = await rejectApprovedDeployment(req.params.id);
    if (!rejected) return res.status(409).json({ error: "This deployment isn't awaiting approval" });

    logEvent(req.user.id, 'deployment.rejected', { projectId: deployment.projectId, meta: { deploymentId: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error("Reject deployment error:", err);
    res.status(500).json({ error: "Failed to reject deployment" });
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

    if (!deployment || !(await requireProjectAccess(req.user.id, deployment.projectId, 'MEMBER'))) {
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

// GET /deployments/compare?a=<id>&b=<id> — commit/branch/build diff between
// two deployments in the same project, plus an env var diff for admins (so
// a rollback/promote decision can be made with full context beforehand).
router.get("/deployments/compare", authMiddleware, async (req, res) => {
  try {
    const { a, b } = req.query;
    if (!a || !b) return res.status(400).json({ error: "Query params a and b are required" });

    const [depA, depB] = await Promise.all([
      prisma.deployment.findUnique({ where: { id: a }, include: { project: { include: { environmentVariables: true } } } }),
      prisma.deployment.findUnique({ where: { id: b }, include: { project: { include: { environmentVariables: true } } } }),
    ]);

    if (!depA || !depB) return res.status(404).json({ error: "Deployment not found" });
    if (depA.projectId !== depB.projectId) {
      return res.status(400).json({ error: "Deployments must belong to the same project" });
    }

    const access = await requireProjectAccess(req.user.id, depA.projectId, 'MEMBER');
    if (!access) return res.status(404).json({ error: "Not found" });

    const summarize = (d) => ({
      id: d.id,
      status: d.status,
      branch: d.branch,
      commitHash: d.commitHash,
      trigger: d.trigger,
      createdAt: d.createdAt,
      finishedAt: d.finishedAt,
      isActive: d.isActive,
      isPreview: d.isPreview,
    });

    const response = { a: summarize(depA), b: summarize(depB) };

    // Env vars aren't versioned per deployment in this schema — they're
    // project-level, so this is the project's *current* config, not a
    // historical snapshot from when either deployment was built. Still
    // useful context before a rollback/promote. Admin-only since it
    // requires decrypting values.
    const isAdmin = await requireProjectAccess(req.user.id, depA.projectId, 'ADMIN');
    if (isAdmin) {
      response.currentEnvVars = depA.project.environmentVariables.map((e) => ({
        key: e.key, environment: e.environment, value: decrypt(e.value),
      }));
    }

    res.json(response);
  } catch (err) {
    console.error("Compare deployments error:", err);
    res.status(500).json({ error: "Failed to compare deployments" });
  }
});

module.exports = router;