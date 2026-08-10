const express = require('express');
const { z } = require('zod');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { rateLimit } = require('../middlewares/rateLimitMiddleware');
const { encrypt, decrypt } = require('../../lib/crypto');
const crypto = require('crypto');
const dns = require('dns/promises');
const bcrypt = require('bcryptjs');
const { ecsClient, CLUSTER, TASK, SUBNETS, SECURITY_GROUP, LAMBDA_EXECUTION_ROLE_ARN, RunTaskCommand, AVAILABLE_REGIONS, DEFAULT_REGION } = require('../services/awsService');
const { getProjectAnalytics, getTrafficAnalytics } = require('../services/analyticsService');
const { logEvent } = require('../services/auditService');
const { sendOrgWebhook } = require('../services/orgWebhookService');
const { unsubscribeToken } = require('../services/statusSubscriberService');
const cloudflareService = require('../services/cloudflareService');
const { projectAccessWhere } = require('../services/projectAccessService');
const { deleteLambdaFunctionsFor, deleteS3Prefix } = require('../services/deploymentCleanupService');
const { hashPassword, verifyPassword, issueSessionToken } = require('../services/previewProtectionService');

const APP_URL = process.env.APP_URL || 'http://localhost:8000';

const router = express.Router();

// GET /regions — available build regions, for the new-project/settings region picker.
router.get("/regions", authMiddleware, async (_req, res) => {
  res.json({ regions: AVAILABLE_REGIONS, default: DEFAULT_REGION });
});

router.post("/project", authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1),
      gitURL: z.string().url(),
      region: z.string().optional(),
    });

    if (!req.user.emailVerified) {
      return res.status(403).json({ error: "Please verify your email address before creating a project." });
    }

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    function slugify(text) {
      return text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
    }

    const baseSlug = slugify(parsed.data.name);

    let slug = baseSlug;
    let count = 1;

    while (await prisma.project.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${count++}`;
    }

    const subDomain = slug;

    // Extract owner/repo from the git URL (e.g. https://github.com/owner/repo(.git))
    // so PR comments and other GitHub-API calls have a target without re-parsing later.
    let githubOwner = null;
    let githubRepo = null;
    const githubMatch = parsed.data.gitURL.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/i);
    if (githubMatch) {
      githubOwner = githubMatch[1];
      githubRepo = githubMatch[2];
    }

    const region = AVAILABLE_REGIONS.includes(parsed.data.region) ? parsed.data.region : DEFAULT_REGION;

    const project = await prisma.project.create({
      data: {
        name: parsed.data.name,
        gitURL: parsed.data.gitURL,
        subDomain,
        slug,
        userId: req.user.id,
        githubOwner,
        githubRepo,
        region,
      },
    });

    logEvent(req.user.id, 'project.created', { projectId: project.id, projectName: project.name });
    res.json({ status: "success", data: project });
  } catch (err) {
    console.error("Create project error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/project/:id", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        ...projectAccessWhere(req.user.id, 'MEMBER'),
      },
      include: {
        deployments: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const activeDeployment =
      project.deployments.find(d => d.isActive) ?? null;

    const liveUrl =
      project.isPublished && activeDeployment
        ? project.customDomain && project.domainVerified
          ? `https://${project.customDomain}`
          : `${APP_URL}/?project=${project.subDomain}`
        : null;

    let status = "NOT_DEPLOYED";

    if (project.deployments.some(d => d.status === "BUILDING")) {
      status = "BUILDING";
    } else if (project.deployments.some(d => d.status === "QUEUED")) {
      status = "QUEUED";
    } else if (project.deployments.some(d => d.status === "FAILED")) {
      status = "FAILED";
    } else if (project.isPublished && activeDeployment) {
      status = "READY";
    }

    res.json({
      data: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        gitURL: project.gitURL,

        status,
        liveUrl,

        productionDeploymentId: activeDeployment
          ? activeDeployment.id
          : null,

        deploymentsCount: project.deployments.length,

        customDomain: project.customDomain,
        domainVerified: project.domainVerified,
        isPublished: project.isPublished,

        buildCommand:    project.buildCommand   ?? null,
        outputDir:       project.outputDir      ?? null,
        installCommand:  project.installCommand ?? null,
        rootDir:         project.rootDir        ?? null,
        region:          project.region,
        smokeTestPath:   project.smokeTestPath ?? null,
        useDockerfile:   project.useDockerfile,
        maintenanceMode:    project.maintenanceMode,
        maintenanceMessage: project.maintenanceMessage ?? null,
        requireApproval:    project.requireApproval,
        orgId: project.orgId ?? null,
        previewDbProvisionWebhookUrl: project.previewDbProvisionWebhookUrl ?? null,
        canaryDeploymentId: project.canaryDeploymentId ?? null,
        canaryPercent:      project.canaryPercent ?? 0,

        notifyWebhookUrl: project.notifyWebhookUrl ?? null,
        hasDeployHook:    !!project.deployHookToken,
        blackoutWindows:  project.blackoutWindows ?? [],
        custom404Html:    project.custom404Html ?? null,
        custom500Html:    project.custom500Html ?? null,
        redirectRules:    project.redirectRules ?? [],
        headerRules:      project.headerRules ?? [],
        geoRules:         project.geoRules ?? null,
        rateLimitPerMinute: project.rateLimitPerMinute ?? null,
        failoverRegion:   project.failoverRegion ?? null,
        stagingBranch:    project.stagingBranch ?? null,
        integrations:     project.integrations ?? {},
        botProtection:    project.botProtection ?? null,
        compressionMode:  project.compressionMode ?? 'auto',
      },
    });
  } catch (err) {
    console.error("Fetch project error:", err);
    res.status(500).json({ error: "Failed to fetch project" });
  }
});

router.get(
  "/project/:id/analytics",
  authMiddleware,
  async (req, res) => {
    try {
      const project = await prisma.project.findFirst({
        where: {
          id: req.params.id,
          ...projectAccessWhere(req.user.id, 'MEMBER'),
        },
        select: { id: true },
      });

      if (!project) {
        return res.status(404).json({ error: "Not found" });
      }

      const data = await getProjectAnalytics(project.id);
      res.json({ data });
    } catch (err) {
      console.error("Project analytics error:", err);
      res
        .status(500)
        .json({ error: "Project analytics failed" });
    }
  }
);

router.get("/project/:id/deployments", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        ...projectAccessWhere(req.user.id, 'MEMBER'),
      },
      include: {
        deployments: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!project) {
      return res.status(404).json({ error: "Not found" });
    }

    const signals = await prisma.deploymentSignal.findMany({
      where: {
        deploymentId: {
          in: project.deployments.map(d => d.id),
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const buildTimeMap = new Map();

    for (const s of signals) {
      if (!buildTimeMap.has(s.deploymentId)) {
        buildTimeMap.set(
          s.deploymentId,
          s.buildTimeMs ?? null
        );
      }
    }

    const BASE_DOMAIN = process.env.BASE_DOMAIN;
    const formatted = project.deployments.map(d => {
      let previewUrl = null;
      if (d.status === "READY") {
        if (d.isPreview && d.previewSubdomain && BASE_DOMAIN) {
          previewUrl = `https://${d.previewSubdomain}.${BASE_DOMAIN}`;
        } else {
          previewUrl = `${APP_URL}/?project=${project.subDomain}&deployment=${d.id}`;
        }
      }

      return {
        id: d.id,
        status: d.status,
        branch: d.branch,
        trigger: d.trigger,
        createdAt: d.createdAt,

        buildTimeMs: buildTimeMap.get(d.id) ?? null,

        isProduction: d.isActive === true,
        isPreview: d.isPreview === true,
        previewSubdomain: d.previewSubdomain ?? null,
        previewUrl,
        awaitingApproval: d.awaitingApproval === true,
        isStaging: d.isStaging === true,

        canPromote: d.status === "READY" && !d.isActive && !d.awaitingApproval,
        canDelete: true,
        canViewLogs: true,
      };
    });

    res.json({ data: formatted });
  } catch (err) {
    console.error("Fetch deployments error:", err);
    res.status(500).json({ error: "Failed to fetch deployments" });
  }
});

router.get("/project/:id/traffic", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'MEMBER') }
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const data = await getTrafficAnalytics(project.id);
    res.json(data);
  } catch (err) {
    console.error("Traffic analytics error:", err);
    res.status(500).json({ error: "Analytics failed" });
  }
});

router.post("/undeploy", authMiddleware, async (req, res) => {
  const { projectId } = req.body;

  const project = await prisma.project.findFirst({
    where: { id: projectId, ...projectAccessWhere(req.user.id, 'ADMIN') },
  });

  if (!project) return res.status(404).json({ error: "Not found" });

  await prisma.deployment.updateMany({
    where: { projectId },
    data: { isActive: false },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: {
      latestDeploymentId: null,
    },
  });

  res.json({ success: true });
});

router.post("/project/:id/publish", authMiddleware, async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
  });

  if (!project) return res.status(404).json({ error: "Not found" });

  await prisma.project.update({
    where: { id: project.id },
    data: { isPublished: true },
  });

  res.json({ success: true });
});

router.post("/projects/:id/unpublish", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
    });

    if (!project) {
      return res.status(404).json({ error: "Not found" });
    }

    await prisma.$transaction([
      prisma.deployment.updateMany({
        where: { projectId: project.id },
        data: { isActive: false },
      }),

      prisma.project.update({
        where: { id: project.id },
        data: {
          latestDeploymentId: null,
          isPublished: false,
        },
      }),
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error("Unpublish error:", err);
    res.status(500).json({ error: "Failed to unpublish project" });
  }
});

router.get("/projects", authMiddleware, async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: projectAccessWhere(req.user.id, 'MEMBER'),
      include: {
        deployments: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = projects.map(p => {
      const active = p.deployments.find(d => d.isActive);

      let status = "NOT_DEPLOYED";

      if (active) {
        status = "READY";
      } else if (p.deployments.some(d => d.status === "BUILDING")) {
        status = "BUILDING";
      } else if (p.deployments.some(d => d.status === "QUEUED")) {
        status = "QUEUED";
      } else if (p.deployments.some(d => d.status === "FAILED")) {
        status = "FAILED";
      }

      const liveUrl = active
        ? p.customDomain && p.domainVerified
          ? `https://${p.customDomain}`
          : `${APP_URL}/?project=${p.slug}`
        : null;

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        subDomain: p.subDomain,
        createdAt: p.createdAt,
        liveUrl,
        status,
        deploymentsCount: p.deployments.length,
        deployments: p.deployments.slice(0, 5),
      };
    });

    res.json({ data: formatted });
  } catch (err) {
    console.error("Fetch projects error:", err);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

// POST /project/:id/transfer — move a project to an org (or back to the
// owner's personal account with targetOrgId: null). Requires OWNER-level
// access on the project itself, and OWNER of the destination org if moving
// into one — you shouldn't be able to dump a project into a team you don't
// actually run.
router.post("/project/:id/transfer", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'OWNER') },
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    const schema = z.object({ targetOrgId: z.string().nullable() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const { targetOrgId } = parsed.data;

    if (targetOrgId) {
      const targetOrg = await prisma.organization.findUnique({ where: { id: targetOrgId }, select: { id: true, name: true } });
      if (!targetOrg) return res.status(404).json({ error: "Target organization not found" });

      const membership = await prisma.organizationMembership.findUnique({
        where: { orgId_userId: { orgId: targetOrgId, userId: req.user.id } },
      });
      if (!membership || membership.role !== 'OWNER') {
        return res.status(403).json({ error: "You must be an owner of the destination team to transfer a project into it" });
      }
    }

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { orgId: targetOrgId },
    });

    logEvent(req.user.id, 'project.transferred', {
      projectId: project.id,
      projectName: project.name,
      meta: { fromOrgId: project.orgId, toOrgId: targetOrgId },
    });

    if (project.orgId) {
      sendOrgWebhook(project.orgId, 'project.transferred_out', {
        projectId: project.id,
        projectName: project.name,
        toOrgId: targetOrgId,
        transferredBy: req.user.id,
      }).catch(() => {});
    }
    if (targetOrgId) {
      sendOrgWebhook(targetOrgId, 'project.transferred_in', {
        projectId: project.id,
        projectName: project.name,
        fromOrgId: project.orgId,
        transferredBy: req.user.id,
      }).catch(() => {});
    }

    res.json({ success: true, data: { orgId: updated.orgId } });
  } catch (err) {
    console.error("Transfer project error:", err);
    res.status(500).json({ error: "Failed to transfer project" });
  }
});

router.delete("/project/:id", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        ...projectAccessWhere(req.user.id, 'OWNER'),
      },
      include: {
        deployments: true,
      },
    });

    if (!project) {
      return res.status(404).json({ error: "Not found" });
    }

    for (const deployment of project.deployments) {
      await deleteLambdaFunctionsFor(deployment);
      await deleteS3Prefix(`__outputs/${project.id}/${deployment.id}/`);
    }

    await prisma.deployment.deleteMany({
      where: { projectId: project.id },
    });

    await prisma.project.delete({
      where: { id: project.id },
    });

    logEvent(req.user.id, 'project.deleted', { projectName: project.name });
    res.json({ success: true });
  } catch (err) {
    console.error("Delete project error:", err);
    res.status(500).json({ error: "Failed to delete project" });
  }
});

router.get("/project/:id/env", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
      include: { environmentVariables: true }
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    const envs = project.environmentVariables.map(e => ({
      key: e.key,
      value: "••••••••",
      id: e.id,
      updatedAt: e.updatedAt
    }));
    res.json(envs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch env vars" });
  }
});

// GET /project/:id/env/reveal — decrypted values, for the CLI's `env pull`.
// Separate from GET /project/:id/env (which masks values for the dashboard
// UI) since this is the only place actual secret values are ever returned.
router.get("/project/:id/env/reveal", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
      include: { environmentVariables: true },
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    const environment = req.query.environment || 'all';
    const envs = project.environmentVariables
      .filter((e) => environment === 'all' || e.environment === 'all' || e.environment === environment)
      .map((e) => ({ key: e.key, value: decrypt(e.value), environment: e.environment }));

    logEvent(req.user.id, 'env.revealed', { projectId: req.params.id });
    res.json(envs);
  } catch (err) {
    console.error("Env reveal error:", err);
    res.status(500).json({ error: "Failed to fetch env vars" });
  }
});

router.post("/project/:id/env", authMiddleware, async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || typeof value !== "string") return res.status(400).json({ error: "Invalid payload" });

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') }
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    const encryptedValue = encrypt(value);

    await prisma.environmentVariable.upsert({
      where: {
        projectId_key_environment: {
          projectId: project.id,
          key: key,
          environment: 'all',
        }
      },
      update: { value: encryptedValue },
      create: {
        projectId: project.id,
        key: key,
        value: encryptedValue,
        environment: 'all',
      }
    });

    logEvent(req.user.id, 'env.added', { projectId: req.params.id, meta: { key } });
    res.json({ success: true });
  } catch (err) {
    console.error("Env save error:", err);
    res.status(500).json({ error: "Failed to save env var" });
  }
});

router.post("/project/:id/env/bulk", authMiddleware, async (req, res) => {
  try {
    const { variables } = req.body;
    if (!Array.isArray(variables)) return res.status(400).json({ error: "variables must be an array" });

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') }
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    const upserts = variables.map((v) => {
      const encryptedValue = encrypt(v.value);
      const environment = v.environment || 'all';
      return prisma.environmentVariable.upsert({
        where: {
          projectId_key_environment: {
            projectId: project.id,
            key: v.key,
            environment,
          }
        },
        update: { value: encryptedValue, environment },
        create: {
          projectId: project.id,
          key: v.key,
          value: encryptedValue,
          environment,
        }
      });
    });

    await prisma.$transaction(upserts);

    res.json({ success: true });
  } catch (err) {
    console.error("Bulk env save error:", err);
    res.status(500).json({ error: "Failed to save env vars" });
  }
});

router.delete("/project/:id/env/:key", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') }
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    await prisma.environmentVariable.deleteMany({
      where: {
        projectId: project.id,
        key: req.params.key,
      }
    });

    logEvent(req.user.id, 'env.deleted', { projectId: req.params.id, meta: { key: req.params.key } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete env var" });
  }
});

router.patch("/project/:id", authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1).optional(),
      gitURL: z.string().url().optional(),
      buildCommand:              z.string().optional(),
      outputDir:                 z.string().optional(),
      installCommand:            z.string().optional(),
      rootDir:                   z.string().optional(),
      notifyWebhookUrl:          z.string().url().optional().nullable(),
      deploymentRetentionCount:  z.number().int().min(1).max(20).optional(),
      region:                    z.enum(AVAILABLE_REGIONS).optional(),
      smokeTestPath:             z.string().max(500).optional().nullable(),
      useDockerfile:             z.boolean().optional(),
      maintenanceMode:           z.boolean().optional(),
      maintenanceMessage:        z.string().max(500).optional().nullable(),
      requireApproval:           z.boolean().optional(),
      previewDbProvisionWebhookUrl: z.string().url().optional().nullable(),
      blackoutWindows: z.array(z.object({
        day: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1439),
        endMinute: z.number().int().min(0).max(1439),
      })).max(20).optional().nullable(),
      custom404Html: z.string().max(50000).optional().nullable(),
      custom500Html: z.string().max(50000).optional().nullable(),
      redirectRules: z.array(z.object({
        source: z.string().min(1).max(500),
        destination: z.string().min(1).max(2000),
        type: z.enum(['redirect', 'rewrite']),
        statusCode: z.number().int().optional(),
      })).max(50).optional().nullable(),
      headerRules: z.array(z.object({
        source: z.string().min(1).max(500),
        headers: z.record(z.string().max(200), z.string().max(2000)),
      })).max(50).optional().nullable(),
      geoRules: z.object({
        mode: z.enum(['allow', 'block']),
        countries: z.array(z.string().length(2)).max(250),
      }).optional().nullable(),
      rateLimitPerMinute: z.number().int().min(1).max(100000).optional().nullable(),
      failoverRegion: z.enum(AVAILABLE_REGIONS).optional().nullable(),
      botProtection: z.object({
        mode: z.enum(['off', 'block']),
        blockEmptyUserAgent: z.boolean().optional(),
        blockedUserAgents: z.array(z.string().max(200)).max(100).optional(),
        maxBotScore: z.number().int().min(1).max(99).optional(),
      }).optional().nullable(),
      compressionMode: z.enum(['auto', 'disabled']).optional(),
      stagingBranch: z.string().max(200).optional().nullable(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    // Error page HTML is served directly to visitors — strip <script> tags
    // before it ever reaches the database.
    for (const field of ['custom404Html', 'custom500Html']) {
      if (typeof parsed.data[field] === 'string') {
        parsed.data[field] = parsed.data[field].replace(/<script[\s\S]*?<\/script>/gi, '');
      }
    }

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
      include: { environmentVariables: true }
    });

    if (!project) return res.status(404).json({ error: "Not found" });

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: parsed.data,
    });

    if (parsed.data.gitURL && parsed.data.gitURL !== project.gitURL) {
      const deploymentCount = await prisma.deployment.count({
        where: { projectId: project.id },
      });

      if (deploymentCount < 3) {
        const deployment = await prisma.deployment.create({
          data: {
            projectId: project.id,
            status: "QUEUED",
            isActive: false,
            trigger: "REDEPLOY",
            branch: "main",
            startedAt: new Date(),
          },
        });

        const userEnvVarsObj = {};
        if (project.environmentVariables) {
          for (const e of project.environmentVariables) {
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
                  { name: "GIT_REPOSITORY_URL", value: parsed.data.gitURL },
                  { name: "PROJECT_ID", value: project.id },
                  { name: "DEPLOYEMENT_ID", value: deployment.id },
                  { name: "BRANCH", value: "main" },
                  { name: "USER_ENV_VARS", value: JSON.stringify(userEnvVarsObj) },
                  { name: "AWS_LAMBDA_ROLE_ARN", value: LAMBDA_EXECUTION_ROLE_ARN },
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
      }
    }

    logEvent(req.user.id, 'project.settings_updated', { projectId: req.params.id });
    res.json({ data: updated });
  } catch (err) {
    console.error("Update project error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const CONFIG_EXPORT_VERSION = 2;

// GET /project/:id/export — a portable JSON snapshot of a project's
// configuration, for replicating or restoring settings on another project.
// Deliberately excludes anything infrastructure-specific to this project
// (id, slug, domains, deployment history) or secret (env var values —
// only their keys are included, so the operator knows what to re-enter).
router.get("/project/:id/export", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
      include: { environmentVariables: true },
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    res.json({
      deployrConfigVersion: CONFIG_EXPORT_VERSION,
      exportedFrom: project.name,
      buildCommand: project.buildCommand ?? null,
      outputDir: project.outputDir ?? null,
      installCommand: project.installCommand ?? null,
      rootDir: project.rootDir ?? null,
      region: project.region,
      smokeTestPath: project.smokeTestPath ?? null,
      useDockerfile: project.useDockerfile,
      maintenanceMode: project.maintenanceMode,
      maintenanceMessage: project.maintenanceMessage ?? null,
      blackoutWindows: project.blackoutWindows ?? null,
      custom404Html: project.custom404Html ?? null,
      custom500Html: project.custom500Html ?? null,
      notifyWebhookUrl: project.notifyWebhookUrl ?? null,
      previewDbProvisionWebhookUrl: project.previewDbProvisionWebhookUrl ?? null,
      deploymentRetentionCount: project.deploymentRetentionCount ?? null,
      redirectRules: project.redirectRules ?? null,
      headerRules: project.headerRules ?? null,
      geoRules: project.geoRules ?? null,
      rateLimitPerMinute: project.rateLimitPerMinute ?? null,
      failoverRegion: project.failoverRegion ?? null,
      envVarKeys: project.environmentVariables.map(e => e.key).sort(),
    });
  } catch (err) {
    console.error("Project export error:", err);
    res.status(500).json({ error: "Failed to export project config" });
  }
});

// POST /project/:id/import — applies a previously exported config snapshot
// to this project. Unknown/extra fields in the uploaded JSON are ignored
// rather than rejected, so exports stay forward-compatible as new fields
// are added. envVarKeys are recreated as empty-value variables (never had
// values to restore) so the operator sees exactly what needs re-entering.
router.post("/project/:id/import", authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      deployrConfigVersion: z.number().optional(),
      buildCommand: z.string().optional().nullable(),
      outputDir: z.string().optional().nullable(),
      installCommand: z.string().optional().nullable(),
      rootDir: z.string().optional().nullable(),
      region: z.enum(AVAILABLE_REGIONS).optional(),
      smokeTestPath: z.string().max(500).optional().nullable(),
      useDockerfile: z.boolean().optional(),
      maintenanceMode: z.boolean().optional(),
      maintenanceMessage: z.string().max(500).optional().nullable(),
      blackoutWindows: z.array(z.object({
        day: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1439),
        endMinute: z.number().int().min(0).max(1439),
      })).max(20).optional().nullable(),
      custom404Html: z.string().max(50000).optional().nullable(),
      custom500Html: z.string().max(50000).optional().nullable(),
      notifyWebhookUrl: z.string().url().optional().nullable(),
      previewDbProvisionWebhookUrl: z.string().url().optional().nullable(),
      deploymentRetentionCount: z.number().int().min(1).max(20).optional().nullable(),
      redirectRules: z.array(z.object({
        source: z.string().min(1).max(500),
        destination: z.string().min(1).max(2000),
        type: z.enum(['redirect', 'rewrite']),
        statusCode: z.number().int().optional(),
      })).max(50).optional().nullable(),
      headerRules: z.array(z.object({
        source: z.string().min(1).max(500),
        headers: z.record(z.string().max(200), z.string().max(2000)),
      })).max(50).optional().nullable(),
      geoRules: z.object({
        mode: z.enum(['allow', 'block']),
        countries: z.array(z.string().length(2)).max(250),
      }).optional().nullable(),
      rateLimitPerMinute: z.number().int().min(1).max(100000).optional().nullable(),
      failoverRegion: z.enum(AVAILABLE_REGIONS).optional().nullable(),
      envVarKeys: z.array(z.string()).max(200).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    const { envVarKeys, deployrConfigVersion, ...settings } = parsed.data;
    for (const field of ['custom404Html', 'custom500Html']) {
      if (typeof settings[field] === 'string') {
        settings[field] = settings[field].replace(/<script[\s\S]*?<\/script>/gi, '');
      }
    }

    await prisma.project.update({ where: { id: project.id }, data: settings });

    let envVarsCreated = 0;
    if (Array.isArray(envVarKeys)) {
      for (const key of envVarKeys) {
        await prisma.environmentVariable.upsert({
          where: { projectId_key_environment: { projectId: project.id, key, environment: 'all' } },
          update: {},
          create: { projectId: project.id, key, value: encrypt(""), environment: 'all' },
        });
        envVarsCreated++;
      }
    }

    logEvent(req.user.id, 'project.config_imported', { projectId: req.params.id });
    res.json({ success: true, envVarsCreated });
  } catch (err) {
    console.error("Project import error:", err);
    res.status(500).json({ error: "Failed to import project config" });
  }
});

router.post("/project/:id/domain", authMiddleware, async (req, res) => {
  const { domain } = req.body;

  const project = await prisma.project.findFirst({
    where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
  });

  if (!project) return res.status(404).json({ error: "Not found" });

  const token = `vercel-clone-${crypto.randomBytes(6).toString("hex")}`;

  await prisma.project.update({
    where: { id: project.id },
    data: {
      customDomain: domain.toLowerCase(),
      domainVerified: false,
      domainVerificationToken: token,
    },
  });

  logEvent(req.user.id, 'domain.added', { projectId: req.params.id, meta: { domain } });
  res.json({
    message: "Add this TXT record to verify ownership, then point your domain at us with a CNAME",
    verificationToken: token,
    cnameTarget: cloudflareService.CF_FALLBACK_ORIGIN || null,
    records: [
      { type: "TXT", name: `_deployr.${domain}`, value: token },
      ...(cloudflareService.CF_FALLBACK_ORIGIN
        ? [{ type: "CNAME", name: domain, value: cloudflareService.CF_FALLBACK_ORIGIN }]
        : []),
    ],
  });
});

router.post("/project/:id/domain/verify", authMiddleware, async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
  });

  if (!project || !project.customDomain)
    return res.status(404).json({ error: "No domain" });

  const host = `_deployr.${project.customDomain}`;

  try {
    const records = await dns.resolveTxt(host);
    const flat = records.flat().join("");

    if (flat !== project.domainVerificationToken) {
      return res.status(400).json({ error: "Verification failed" });
    }

    // Ownership confirmed — hand the hostname to Cloudflare for SaaS so it
    // issues and auto-renews a TLS certificate. Non-fatal if unconfigured or
    // the API call fails; ssl_status just stays "none"/"pending" and the
    // status endpoint below can be polled/retried.
    let sslStatus = 'none';
    let cfCustomHostnameId = null;
    if (cloudflareService.isConfigured()) {
      const registered = await cloudflareService.createCustomHostname(project.customDomain);
      if (registered) {
        cfCustomHostnameId = registered.id;
        sslStatus = registered.sslStatus;
      } else {
        sslStatus = 'error';
      }
    }

    await prisma.project.update({
      where: { id: project.id },
      data: { domainVerified: true, cfCustomHostnameId, sslStatus },
    });

    logEvent(req.user.id, 'domain.verified', { projectId: req.params.id });
    res.json({ success: true, sslStatus });
  } catch (err) {
    res.status(400).json({ error: "DNS lookup failed" });
  }
});

router.get("/project/:id/domain/status", authMiddleware, async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'MEMBER') },
  });

  if (!project || !project.customDomain) {
    return res.status(404).json({ error: "No domain" });
  }

  if (!project.cfCustomHostnameId) {
    return res.json({ sslStatus: project.sslStatus || 'none' });
  }

  const liveStatus = await cloudflareService.getCustomHostnameStatus(project.cfCustomHostnameId);
  if (liveStatus && liveStatus !== project.sslStatus) {
    await prisma.project.update({
      where: { id: project.id },
      data: { sslStatus: liveStatus },
    });
  }

  res.json({ sslStatus: liveStatus || project.sslStatus || 'none' });
});

// POST /project/:id/cache/purge — invalidate specific paths on the edge
// cache immediately, rather than waiting on TTL. Only meaningful once
// Cloudflare is configured (see cloudflareService.isConfigured) — the S3
// static-asset path is otherwise cached client/edge-side with no purge
// mechanism this platform controls.
router.post("/project/:id/cache/purge", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    if (!cloudflareService.isConfigured()) {
      return res.status(400).json({ error: "Cloudflare isn't configured on this platform — cache purge is unavailable" });
    }

    const schema = z.object({ paths: z.array(z.string()).min(1).max(30).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    // Custom domains purge cleanly (https://domain + path). Projects only
    // reachable via the platform's own query-param URL scheme
    // (?project=slug) don't have per-path URLs to purge — the whole page is
    // one URL — so purge only applies once a verified custom domain exists.
    if (!project.customDomain || !project.domainVerified) {
      return res.status(400).json({ error: "Cache purge requires a verified custom domain" });
    }

    const paths = parsed.data.paths ?? ['/'];
    const base = `https://${project.customDomain}`;
    const urls = paths.map((p) => `${base}${p.startsWith('/') ? p : `/${p}`}`);
    const success = await cloudflareService.purgeUrls(urls);

    if (!success) return res.status(502).json({ error: "Cloudflare purge request failed" });

    logEvent(req.user.id, 'cache.purged', { projectId: project.id, meta: { paths } });
    res.json({ success: true, purged: urls });
  } catch (err) {
    console.error("Cache purge error:", err);
    res.status(500).json({ error: "Failed to purge cache" });
  }
});

router.delete("/project/:id/domain", authMiddleware, async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
  });

  if (!project) return res.status(404).json({ error: "Not found" });

  if (project.cfCustomHostnameId) {
    cloudflareService.deleteCustomHostname(project.cfCustomHostnameId).catch(() => {});
  }

  await prisma.project.update({
    where: { id: project.id },
    data: {
      customDomain: null,
      domainVerified: false,
      domainVerificationToken: null,
      cfCustomHostnameId: null,
      sslStatus: 'none',
    },
  });

  logEvent(req.user.id, 'domain.removed', { projectId: project.id });
  res.json({ success: true });
});

// ── Preview deployment protection ────────────────────────────────────────────

router.get("/project/:id/protection", authMiddleware, async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'MEMBER') },
    select: { previewProtectionPasswordHash: true },
  });
  if (!project) return res.status(404).json({ error: "Not found" });
  res.json({ enabled: !!project.previewProtectionPasswordHash });
});

router.post("/project/:id/protection", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    const { password } = req.body;
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const previewProtectionPasswordHash = await hashPassword(password);
    await prisma.project.update({
      where: { id: project.id },
      data: { previewProtectionPasswordHash },
    });

    logEvent(req.user.id, 'protection.enabled', { projectId: project.id });
    res.json({ success: true, enabled: true });
  } catch (err) {
    console.error("Enable protection error:", err);
    res.status(500).json({ error: "Failed to enable preview protection" });
  }
});

router.delete("/project/:id/protection", authMiddleware, async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
  });
  if (!project) return res.status(404).json({ error: "Not found" });

  await prisma.project.update({
    where: { id: project.id },
    data: { previewProtectionPasswordHash: null },
  });

  logEvent(req.user.id, 'protection.disabled', { projectId: project.id });
  res.json({ success: true, enabled: false });
});

// Public — called by the edge worker (server-to-server) when a viewer submits
// the preview-protection password form. No auth beyond the password itself,
// same trust model as the password prompt it's answering.
router.post("/protection/verify", async (req, res) => {
  try {
    const { projectId, password } = req.body || {};
    if (!projectId || !password) {
      return res.status(400).json({ error: "projectId and password required" });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { previewProtectionPasswordHash: true },
    });
    if (!project || !project.previewProtectionPasswordHash) {
      return res.status(400).json({ error: "Protection is not enabled for this project" });
    }

    const ip = req.headers['x-forwarded-for'] || req.ip;
    if (!(await rateLimit(`protection-verify-${projectId}-${ip}`, 10, 60_000))) {
      return res.status(429).json({ error: "Too many attempts. Slow down." });
    }

    const ok = await verifyPassword(password, project.previewProtectionPasswordHash);
    if (!ok) return res.status(401).json({ error: "Incorrect password" });

    const token = issueSessionToken(projectId);
    res.json({ token });
  } catch (err) {
    console.error("Protection verify error:", err);
    res.status(500).json({ error: "Failed to verify password" });
  }
});

// Preview protection only ever gates preview deployments (matches Vercel's
// model) — production traffic is never challenged.
async function isProtected(projectId, isPreview) {
  if (!isPreview) return false;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { previewProtectionPasswordHash: true },
  });
  return !!project?.previewProtectionPasswordHash;
}

// Everything the Cloudflare worker needs beyond routing info — error pages,
// redirect/rewrite rules, header rules, geo rules, rate limit. Fetched as one
// object so every /resolve/:host branch (deployment id, preview subdomain,
// direct deployment link, primary domain) can spread it into its response.
async function edgeConfig(projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      custom404Html: true,
      custom500Html: true,
      redirectRules: true,
      headerRules: true,
      geoRules: true,
      rateLimitPerMinute: true,
      botProtection: true,
      compressionMode: true,
    },
  });

  const experiments = await prisma.experiment.findMany({
    where: { projectId, enabled: true },
    select: { id: true, key: true, variants: true, goalPath: true },
  });

  return {
    custom404Html: project?.custom404Html ?? null,
    custom500Html: project?.custom500Html ?? null,
    redirectRules: project?.redirectRules ?? null,
    headerRules: project?.headerRules ?? null,
    geoRules: project?.geoRules ?? null,
    rateLimitPerMinute: project?.rateLimitPerMinute ?? null,
    botProtection: project?.botProtection ?? null,
    compressionMode: project?.compressionMode ?? 'auto',
    experiments,
  };
}

router.get("/resolve/:host", async (req, res) => {
  try {
    const host = req.params.host.toLowerCase();

    const cleanHost = host.split(":")[0];
    const parts = cleanHost.split(".");
    const subdomain = parts[0];

    // Check query parameter deployment first
    const deploymentIdQuery = req.query.deployment;
    if (deploymentIdQuery) {
      const deployment = await prisma.deployment.findUnique({
        where: { id: deploymentIdQuery },
      });
      if (deployment && deployment.status === "READY") {
        return res.json({
          projectId: deployment.projectId,
          deploymentId: deployment.id,
          functionUrl: deployment.functionUrl,
          functionUrls: deployment.functionUrls || {},
          protected: await isProtected(deployment.projectId, deployment.isPreview),
          ...(await edgeConfig(deployment.projectId)),
        });
      }
    }

    // Check preview subdomain (e.g. myapp-feature-auth.deployr.dev)
    const previewDep = await prisma.deployment.findFirst({
      where: { previewSubdomain: subdomain, status: "READY" },
    });
    if (previewDep) {
      return res.json({
        projectId: previewDep.projectId,
        deploymentId: previewDep.id,
        functionUrl: previewDep.functionUrl,
        functionUrls: previewDep.functionUrls || {},
        protected: await isProtected(previewDep.projectId, true),
        ...(await edgeConfig(previewDep.projectId)),
      });
    }

    if (parts.length >= 3) {
      const deploymentId = parts[0];
      const projectId = parts[1];

      const deployment = await prisma.deployment.findUnique({
        where: { id: deploymentId },
      });

      if (
        deployment &&
        deployment.projectId === projectId &&
        deployment.status === "READY"
      ) {
        return res.json({
          projectId,
          deploymentId,
          functionUrl: deployment.functionUrl,
          functionUrls: deployment.functionUrls || {},
          protected: await isProtected(projectId, deployment.isPreview),
          ...(await edgeConfig(projectId)),
        });
      }
    }

    // Check staging subdomain (e.g. myapp-staging.deployr.dev) — persistent,
    // not torn down like PR previews. Always serves the most recent READY
    // staging build, same "no isActive requirement" model as a preview.
    if (subdomain.endsWith('-staging')) {
      const baseSlug = subdomain.slice(0, -'-staging'.length);
      const stagingProject = await prisma.project.findUnique({ where: { slug: baseSlug } });
      if (stagingProject) {
        const stagingDep = await prisma.deployment.findFirst({
          where: { projectId: stagingProject.id, isStaging: true, status: "READY" },
          orderBy: { createdAt: "desc" },
        });
        if (stagingDep) {
          return res.json({
            projectId: stagingProject.id,
            deploymentId: stagingDep.id,
            functionUrl: stagingDep.functionUrl,
            functionUrls: stagingDep.functionUrls || {},
            protected: await isProtected(stagingProject.id, true),
            ...(await edgeConfig(stagingProject.id)),
          });
        }
      }
    }

    const project = await prisma.project.findFirst({
      where: {
        OR: [
          { id: subdomain },
          { subDomain: subdomain },
          { customDomain: cleanHost, domainVerified: true },
        ],
      },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (!project.isPublished) {
      return res.status(404).json({ error: "Project is not published" });
    }

    // Maintenance mode only gates the primary domain/subdomain resolution
    // path (real end-user traffic) — direct deployment/preview URLs above
    // stay reachable so the team can still QA during a maintenance window.
    if (project.maintenanceMode) {
      return res.json({ maintenance: true, message: project.maintenanceMessage || null });
    }

    const errorPages = { custom404Html: project.custom404Html ?? null, custom500Html: project.custom500Html ?? null };

    const active = await prisma.deployment.findFirst({
      where: {
        projectId: project.id,
        isActive: true,
        status: "READY",
      },
    });

    if (!active) {
      return res.status(404).json({ error: "No active deployment" });
    }

    // Canary rollout: route canaryPercent% of resolutions to the candidate
    // deployment instead. This response is edge-cached for 60s (see the
    // Cloudflare worker), so the split plays out per-edge-node over the
    // rollout's lifetime rather than per individual request.
    let served = active;
    if (project.canaryDeploymentId && project.canaryPercent > 0 && Math.random() * 100 < project.canaryPercent) {
      const canary = await prisma.deployment.findFirst({
        where: { id: project.canaryDeploymentId, projectId: project.id, status: "READY" },
      });
      if (canary) served = canary;
    }

    res.json({
      projectId: project.id,
      deploymentId: served.id,
      functionUrl: served.functionUrl,
      functionUrls: served.functionUrls || {},
      isCanary: served.id !== active.id,
      protected: project.previewProtectionPasswordHash ? served.isPreview : false,
      ...errorPages,
    });
  } catch (err) {
    console.error("Resolve error:", err);
    res.status(500).json({ error: "Resolve failed" });
  }
});

// ── Deploy hooks ──────────────────────────────────────────────────────────────

router.post("/project/:id/deploy-hook", authMiddleware, async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
  });
  if (!project) return res.status(404).json({ error: "Not found" });

  const token = crypto.randomBytes(24).toString("hex");
  await prisma.project.update({
    where: { id: project.id },
    data: { deployHookToken: token },
  });

  const hookUrl = `${process.env.API_URL || 'http://localhost:9000'}/hooks/${token}`;
  logEvent(req.user.id, 'deploy_hook.created', { projectId: project.id });
  res.json({ hookUrl });
});

// POST /project/:id/regenerate-hook-token — rotate the deploy hook secret
// without deleting and re-creating the hook. ADMIN access required (same as
// creating the hook in the first place).
router.post("/project/:id/regenerate-hook-token", authMiddleware, async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
  });
  if (!project) return res.status(403).json({ error: "Forbidden" });

  const token = crypto.randomBytes(24).toString("hex");
  const updated = await prisma.project.update({
    where: { id: project.id },
    data: { deployHookToken: token },
    select: { deployHookToken: true },
  });

  logEvent(req.user.id, 'deploy_hook.regenerated', { projectId: project.id });
  res.json({ deployHookToken: updated.deployHookToken });
});

router.delete("/project/:id/deploy-hook", authMiddleware, async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
  });
  if (!project) return res.status(404).json({ error: "Not found" });

  await prisma.project.update({
    where: { id: project.id },
    data: { deployHookToken: null },
  });
  logEvent(req.user.id, 'deploy_hook.revoked', { projectId: project.id });
  res.json({ success: true });
});

// ── Public status page ────────────────────────────────────────────────────────

// GET /status/:slug — public project status page data (no auth required)
router.get("/status/:slug", async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { slug: req.params.slug },
      select: {
        id: true,
        name: true,
        slug: true,
        isPublished: true,
        uptimeChecks: {
          orderBy: { checkedAt: "desc" },
          take: 90,
          select: { up: true, latencyMs: true, checkedAt: true },
        },
        deployments: {
          where: { isActive: true },
          take: 1,
          select: { status: true, createdAt: true, branch: true },
        },
      },
    });

    if (!project || !project.isPublished) {
      return res.status(404).json({ error: "Not found" });
    }

    const checks = project.uptimeChecks;
    const total = checks.length;
    const upCount = checks.filter(c => c.up).length;
    const uptimePct = total > 0 ? Math.round((upCount / total) * 1000) / 10 : null;
    const avgLatency = total > 0
      ? Math.round(checks.reduce((s, c) => s + (c.latencyMs ?? 0), 0) / total)
      : null;

    res.json({
      name: project.name,
      slug: project.slug,
      uptimePct,
      avgLatency,
      currentStatus: checks[0]?.up === false ? "degraded" : "operational",
      activeDeployment: project.deployments[0] ?? null,
      checks: checks.slice(0, 60).reverse(), // oldest → newest for chart
    });
  } catch (err) {
    console.error("Status page error:", err);
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

// ── Status page incident subscriptions ────────────────────────────────────────

// POST /status/:slug/subscribe — public, no auth. Subscribes an email to
// this project's incident notifications (see uptimeMonitorJob, which emails
// subscribers on an up→down transition).
router.post("/status/:slug/subscribe", async (req, res) => {
  try {
    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "A valid email is required" });

    const project = await prisma.project.findUnique({
      where: { slug: req.params.slug },
      select: { id: true, isPublished: true },
    });
    if (!project || !project.isPublished) return res.status(404).json({ error: "Not found" });

    await prisma.statusSubscriber.upsert({
      where: { projectId_email: { projectId: project.id, email: parsed.data.email } },
      update: {},
      create: { projectId: project.id, email: parsed.data.email },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Status subscribe error:", err);
    res.status(500).json({ error: "Failed to subscribe" });
  }
});

// GET /status/:slug/unsubscribe?email=&token= — the link sent in incident
// emails. Token is an HMAC over projectId+email so it can't be spoofed
// without ever needing the subscriber to create an account.
router.get("/status/:slug/unsubscribe", async (req, res) => {
  const htmlPage = (message) =>
    res.set('Content-Type', 'text/html; charset=utf-8').send(
      `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribe</title>
      <style>body{font-family:sans-serif;max-width:420px;margin:20vh auto;padding:0 16px;text-align:center;color:#333}</style></head>
      <body><h2>${message}</h2></body></html>`
    );

  try {
    const email = req.query.email;
    const token = req.query.token;
    if (typeof email !== 'string' || typeof token !== 'string') {
      return htmlPage("This unsubscribe link is missing required parameters.");
    }

    const project = await prisma.project.findUnique({ where: { slug: req.params.slug }, select: { id: true } });
    if (!project) return htmlPage("Project not found.");

    if (unsubscribeToken(project.id, email) !== token) {
      return htmlPage("This unsubscribe link is invalid or has expired.");
    }

    await prisma.statusSubscriber.deleteMany({ where: { projectId: project.id, email } });
    return htmlPage(`You've been unsubscribed from incident updates for this project.`);
  } catch (err) {
    console.error("Status unsubscribe error:", err);
    return htmlPage("Something went wrong — please try again later.");
  }
});

// ── Uptime ────────────────────────────────────────────────────────────────────

router.get("/project/:id/uptime", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'MEMBER') },
      select: { id: true },
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const checks = await prisma.uptimeCheck.findMany({
      where: { projectId: project.id, checkedAt: { gte: since } },
      orderBy: { checkedAt: 'asc' },
      select: { up: true, statusCode: true, latencyMs: true, checkedAt: true },
    });

    const total = checks.length;
    const upCount = checks.filter(c => c.up).length;
    const uptimePct = total > 0 ? Math.round((upCount / total) * 1000) / 10 : null;
    const latest = checks.at(-1) ?? null;

    res.json({ uptimePct, total, upCount, latest, checks: checks.slice(-60) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch uptime" });
  }
});

module.exports = router;
