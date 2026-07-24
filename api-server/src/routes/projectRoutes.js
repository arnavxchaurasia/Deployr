const express = require('express');
const { z } = require('zod');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { rateLimit } = require('../middlewares/rateLimitMiddleware');
const { encrypt, decrypt } = require('../../lib/crypto');
const crypto = require('crypto');
const dns = require('dns/promises');
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const bcrypt = require('bcryptjs');
const { ecsClient, CLUSTER, TASK, SUBNETS, SECURITY_GROUP, LAMBDA_EXECUTION_ROLE_ARN, RunTaskCommand } = require('../services/awsService');
const { getProjectAnalytics, getTrafficAnalytics } = require('../services/analyticsService');
const { logEvent } = require('../services/auditService');

const APP_URL = process.env.APP_URL || 'http://localhost:8000';
const S3_BUCKET = process.env.S3_BUCKET || 'vercel-clone-ws';

async function deleteS3Prefix(prefix) {
  const s3 = new S3Client({ region: "us-east-1" });
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

const router = express.Router();

router.post("/project", authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1),
      gitURL: z.string().url(),
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

    const project = await prisma.project.create({
      data: {
        name: parsed.data.name,
        gitURL: parsed.data.gitURL,
        subDomain,
        slug,
        userId: req.user.id,
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
        userId: req.user.id,
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

        notifyWebhookUrl: project.notifyWebhookUrl ?? null,
        hasDeployHook:    !!project.deployHookToken,
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
          userId: req.user.id,
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
        userId: req.user.id,
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

        canPromote: d.status === "READY" && !d.isActive,
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
      where: { id: req.params.id, userId: req.user.id }
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
    where: { id: projectId, userId: req.user.id },
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
    where: { id: req.params.id, userId: req.user.id },
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
      where: { id: req.params.id, userId: req.user.id },
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
      where: { userId: req.user.id },
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

router.delete("/project/:id", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
      include: {
        deployments: true,
      },
    });

    if (!project) {
      return res.status(404).json({ error: "Not found" });
    }

    for (const deployment of project.deployments) {
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
      where: { id: req.params.id, userId: req.user.id },
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

router.post("/project/:id/env", authMiddleware, async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || typeof value !== "string") return res.status(400).json({ error: "Invalid payload" });

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user.id }
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
      where: { id: req.params.id, userId: req.user.id }
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
      where: { id: req.params.id, userId: req.user.id }
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
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user.id },
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

router.post("/project/:id/domain", authMiddleware, async (req, res) => {
  const { domain } = req.body;

  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.user.id },
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
    message: "Add this TXT record to verify domain",
    record: {
      type: "TXT",
      name: `_deployr.${domain}`,
      value: token,
    },
  });
});

router.post("/project/:id/domain/verify", authMiddleware, async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.user.id },
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

    await prisma.project.update({
      where: { id: project.id },
      data: { domainVerified: true },
    });

    logEvent(req.user.id, 'domain.verified', { projectId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: "DNS lookup failed" });
  }
});

router.delete("/project/:id/domain", authMiddleware, async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });

  if (!project) return res.status(404).json({ error: "Not found" });

  await prisma.project.update({
    where: { id: project.id },
    data: {
      customDomain: null,
      domainVerified: false,
      domainVerificationToken: null,
    },
  });

  logEvent(req.user.id, 'domain.removed', { projectId: project.id });
  res.json({ success: true });
});

router.get("/resolve/:host", async (req, res) => {
  try {
    const host = req.params.host.toLowerCase();

    const cleanHost = host.split(":")[0];
    const parts = cleanHost.split(".");

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
        });
      }
    }

    const subdomain = parts[0];

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

    res.json({
      projectId: project.id,
      deploymentId: active.id,
      functionUrl: active.functionUrl,
    });
  } catch (err) {
    console.error("Resolve error:", err);
    res.status(500).json({ error: "Resolve failed" });
  }
});

// ── Deploy hooks ──────────────────────────────────────────────────────────────

router.post("/project/:id/deploy-hook", authMiddleware, async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.user.id },
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

router.delete("/project/:id/deploy-hook", authMiddleware, async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.user.id },
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

// ── Uptime ────────────────────────────────────────────────────────────────────

router.get("/project/:id/uptime", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user.id },
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
