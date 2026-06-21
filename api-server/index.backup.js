const express = require("express");
const { generateSlug } = require("random-word-slugs");
const { ECSClient, RunTaskCommand } = require("@aws-sdk/client-ecs");
const { Server } = require("socket.io");
const cors = require("cors");
const { z } = require("zod");

require("dotenv").config();
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const { prisma } = require("./lib/prisma");

const { StopTaskCommand } = require("@aws-sdk/client-ecs");
const { createClient } = require("@clickhouse/client");
const { encrypt, decrypt } = require("./lib/crypto");
const { Kafka } = require("kafkajs");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
const app = express();
const PORT = 9000;
const crypto = require("crypto");
const dns = require("dns/promises");

const {
  getDashboardAnalytics,
  getProjectAnalytics,
  getTrafficAnalytics
} = require("./analytics");


app.use(express.json());
app.use(cors({
  origin: "http://localhost:3000",
  credentials: true,
}));


// auth middleware for filtering projects
app.use(cookieParser());
const { getToken } = require("next-auth/jwt");

// authentication middleware
async function authMiddleware(req, res, next) {
  try {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    // No session token
    if (!token?.id) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    let user;

    // 👇 DB check wrapped safely
    try {
      user = await prisma.user.findUnique({
        where: { id: token.id },
        select: { id: true },
      });
    } catch (dbErr) {
      console.error("Database unreachable in authMiddleware:", dbErr);
      return res.status(503).json({
        error: "Service temporarily unavailable. Please try again.",
      });
    }

    // User deleted but session still exists
    if (!user) {
      return res.status(401).json({ error: "Session invalid" });
    }

    // Attach user to request
    req.user = { id: user.id };
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(401).json({ error: "Unauthorized" });
  }
}


//
const rateLimitMap = new Map();

function rateLimit(key, limit = 5, windowMs = 60_000) {
  const now = Date.now();
  const record = rateLimitMap.get(key) || { count: 0, time: now };

  if (now - record.time > windowMs) {
    record.count = 0;
    record.time = now;
  }

  record.count++;
  rateLimitMap.set(key, record);

  return record.count <= limit;
}


// ---------------- Socket.io ----------------
const io = new Server({
  cors: { origin: "*" },
});

io.on("connection", socket => {
  socket.on("subscribe", payload => {
    // ✅ SUPPORT BOTH STRING + OBJECT
    const deploymentId =
      typeof payload === "string"
        ? payload
        : payload?.deploymentId;

    if (!deploymentId) return;

    socket.join(deploymentId);

    // DEBUG (remove later)
    console.log(
      `Socket ${socket.id} subscribed to ${deploymentId}`
    );
  });

  socket.on("subscribe_user", userId => {
    if (!userId) return;
    socket.join(`user:${userId}`);
    console.log(`Socket ${socket.id} subscribed to user:${userId}`);
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

io.listen(9002, () =>
  console.log("Socket server on 9002")
);



// ---------------- Kafka (Aiven mTLS) ----------------
const kafka = new Kafka({
  clientId: "api-server",
  brokers: ["kafka-26f06e40-notesxmait-c472.j.aivencloud.com:20310"],

  ssl: {
    rejectUnauthorized: true,

    // IMPORTANT: remove "utf-8"
    ca: [fs.readFileSync(path.join(__dirname, "kafka-certs/ca.pem"))],
    cert: fs.readFileSync(path.join(__dirname, "kafka-certs/service.cert")),
    key: fs.readFileSync(path.join(__dirname, "kafka-certs/service.key")),

    // VERY IMPORTANT for Aiven TLS
    servername: "kafka-26f06e40-notesxmait-c472.j.aivencloud.com",
  },

  connectionTimeout: 15000,
  requestTimeout: 30000,
});

const consumer = kafka.consumer({
  groupId: "api-server-logs-consumer",
});

// ---------------- ClickHouse ----------------
const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL,
  database: process.env.CLICKHOUSE_DB,
});

// ---------------- Kafka Consumer ----------------
const writtenSignals = new Set();

async function initKafkaConsumer() {
  await consumer.connect();

  await consumer.subscribe({
    topics: ["container-logs"],
    fromBeginning: false, // ✅ DO NOT CHANGE
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message?.value) return;

      let data;
      try {
        data = JSON.parse(message.value.toString());
      } catch {
        console.error("Invalid Kafka message:", message.value.toString());
        return;
      }

      const { DEPLOYEMENT_ID, log } = data;
      if (!DEPLOYEMENT_ID || !log) return;

      const lower = log.toLowerCase();
      const timestamp = new Date(); // ✅ SINGLE SOURCE OF TIME

      console.log("LOG:", DEPLOYEMENT_ID, log);

      /* ------------------------------------------------
   1. Persist log (SOURCE OF TRUTH)
------------------------------------------------ */
await prisma.logEvent.create({
  data: {
    deploymentId: DEPLOYEMENT_ID,
    log,
    timestamp,
  },
});

      /* ------------------------------------------------
         2. Emit realtime log (LIVE ONLY)
         IMPORTANT: emit OBJECT, NOT JSON STRING
      ------------------------------------------------ */
      io.to(DEPLOYEMENT_ID).emit("message", {
        log,
        timestamp: timestamp.toISOString(),
      });

      /* ------------------------------------------------
         3. QUEUED → BUILDING (startedAt ONCE)
      ------------------------------------------------ */
      await prisma.deployment.updateMany({
        where: {
          id: DEPLOYEMENT_ID,
          status: "QUEUED",
        },
        data: {
          status: "BUILDING",
          startedAt: timestamp,
        },
      });

      /* ------------------------------------------------
         X. FUNCTION URL (LAMBDA)
      ------------------------------------------------ */
      if (log.startsWith("LAMBDA_URL: ")) {
        const functionUrl = log.replace("LAMBDA_URL: ", "").trim();
        await prisma.deployment.update({
          where: { id: DEPLOYEMENT_ID },
          data: { functionUrl },
        });
      }

      /* ------------------------------------------------
         4. SUCCESS → READY + METRICS
      ------------------------------------------------ */
      const isBuildFinished =
        lower.includes("build complete") ||
        lower.includes("build finished") ||
        lower.includes("done");

      if (isBuildFinished) {
        const deployment = await prisma.deployment.findUnique({
          where: { id: DEPLOYEMENT_ID },
          select: {
            projectId: true,
            status: true,
            startedAt: true,
          },
        });

        if (
          !deployment ||
          deployment.status === "READY" ||
          writtenSignals.has(DEPLOYEMENT_ID)
        ) {
          return;
        }

        const finishedAt = new Date();
        const buildTimeMs =
          deployment.startedAt
            ? finishedAt.getTime() - deployment.startedAt.getTime()
            : null;

        await prisma.$transaction([
          prisma.deployment.update({
            where: { id: DEPLOYEMENT_ID },
            data: {
              status: "READY",
              isActive: true,
              finishedAt,
            },
          }),

          prisma.deploymentSignal.create({
            data: {
              deploymentId: DEPLOYEMENT_ID,
              buildTimeMs,
            },
          }),

          prisma.deployment.updateMany({
            where: {
              projectId: deployment.projectId,
              NOT: { id: DEPLOYEMENT_ID },
            },
            data: { isActive: false },
          }),

          prisma.project.update({
            where: { id: deployment.projectId },
            data: {
              latestDeploymentId: DEPLOYEMENT_ID,
              deployedAt: finishedAt,
              lastDeployedAt: finishedAt,
            },
          }),
        ]);

        writtenSignals.add(DEPLOYEMENT_ID);
        setTimeout(
          () => writtenSignals.delete(DEPLOYEMENT_ID),
          10 * 60 * 1000
        );

        try {
          invalidateAnalytics(null, deployment.projectId);
        } catch {}

        console.log("Deployment promoted:", DEPLOYEMENT_ID);
        return;
      }

      /* ------------------------------------------------
         5. FAILURE → FAILED + METRICS
      ------------------------------------------------ */
      const isBuildFailed =
        lower.includes("build failed") ||
        lower.includes("command failed") ||
        lower.includes("exit code") ||
        lower.includes("fatal") ||
        lower.includes("uncaught exception");

      if (isBuildFailed) {
        const deployment = await prisma.deployment.findUnique({
          where: { id: DEPLOYEMENT_ID },
          select: {
            projectId: true,
            status: true,
            startedAt: true,
          },
        });

        if (
          !deployment ||
          deployment.status === "READY" ||
          writtenSignals.has(DEPLOYEMENT_ID)
        ) {
          return;
        }

        const finishedAt = new Date();
        const buildTimeMs =
          deployment.startedAt
            ? finishedAt.getTime() - deployment.startedAt.getTime()
            : null;

        const updated = await prisma.deployment.updateMany({
          where: {
            id: DEPLOYEMENT_ID,
            status: { notIn: ["FAILED", "READY"] },
          },
          data: {
            status: "FAILED",
            finishedAt,
          },
        });

        if (updated.count > 0) {
          await prisma.deploymentSignal.create({
            data: {
              deploymentId: DEPLOYEMENT_ID,
              buildTimeMs,
            },
          });

          writtenSignals.add(DEPLOYEMENT_ID);
          setTimeout(
            () => writtenSignals.delete(DEPLOYEMENT_ID),
            10 * 60 * 1000
          );

          try {
            invalidateAnalytics(null, deployment.projectId);
          } catch {}

          console.log("Deployment FAILED:", DEPLOYEMENT_ID);
        }
      }
    },
  });
}

initKafkaConsumer();





// ---------------- AWS ECS ----------------
const ecsClient = new ECSClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});


const CLUSTER =
  "arn:aws:ecs:us-east-1:097457367826:cluster/builder-cluster-ws";
const TASK =
  "arn:aws:ecs:us-east-1:097457367826:task-definition/builder-task";

// ---------------- Routes ----------------

// Create project
app.post("/project", authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1),
      gitURL: z.string().url(),
    });

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

    // ensure slug uniqueness
    let slug = baseSlug;
    let count = 1;

    while (await prisma.project.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${count++}`;
    }

    // IMPORTANT FIX: slug = subdomain
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

    res.json({ status: "success", data: project });
  } catch (err) {
    console.error("Create project error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});



// Get single project (production-aware + analytics-ready)
app.get("/project/:id", authMiddleware, async (req, res) => {
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

    /* ------------------------------------------------
       Resolve active deployment
    ------------------------------------------------ */
    const activeDeployment =
      project.deployments.find(d => d.isActive) ?? null;

    /* ------------------------------------------------
       Production URL
    ------------------------------------------------ */
    const liveUrl =
      project.isPublished && activeDeployment
        ? project.customDomain && project.domainVerified
          ? `https://${project.customDomain}`
          : `http://${project.subDomain}.localhost:8000`
        : null;

    /* ------------------------------------------------
       Status resolution (priority-based)
    ------------------------------------------------ */
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
      },
    });
  } catch (err) {
    console.error("Fetch project error:", err);
    res.status(500).json({ error: "Failed to fetch project" });
  }
});

// Project analytics
app.get(
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




// Deployment history API (UI-ready)
app.get("/project/:id/deployments", authMiddleware, async (req, res) => {
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

    // 1️⃣ Fetch all signals for these deployments
    const signals = await prisma.deploymentSignal.findMany({
      where: {
        deploymentId: {
          in: project.deployments.map(d => d.id),
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 2️⃣ Map deploymentId → latest buildTimeMs
    const buildTimeMap = new Map();

    for (const s of signals) {
      if (!buildTimeMap.has(s.deploymentId)) {
        buildTimeMap.set(
          s.deploymentId,
          s.buildTimeMs ?? null
        );
      }
    }

    // 3️⃣ Format response
    const formatted = project.deployments.map(d => {
      const previewUrl = `http://${d.id}.${project.id}.localhost:8000`;

      return {
        id: d.id,
        status: d.status,
        branch: d.branch,
        trigger: d.trigger,
        createdAt: d.createdAt,

        // ✅ now always valid
        buildTimeMs: buildTimeMap.get(d.id) ?? null,

        isProduction: d.isActive === true,
        previewUrl: d.status === "READY" ? previewUrl : null,

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


// Internal: update deployment status (called by builder)
app.post("/internal/deployments/:id/status", async (req, res) => {
  try {
    const secret = req.headers["x-internal-secret"];

    if (secret !== process.env.INTERNAL_SECRET) {
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
      data: { status },
    });

    res.json({ success: true, data: deployment });
  } catch (err) {
    console.error("Status update error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});


// Edge Telemetry Tracking (No auth required, called by Cloudflare proxy)
app.post("/track", async (req, res) => {
  try {
    const { projectId, path, status, latencyMs, cached, country, city } = req.body;
    
    if (!projectId) {
      return res.status(400).json({ error: "Missing projectId" });
    }

    await prisma.requestLog.create({
      data: {
        projectId,
        path: path || "/",
        status: status || 200,
        latencyMs: latencyMs || 0,
        cached: Boolean(cached),
        country,
        city,
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Telemetry error:", err);
    res.status(500).json({ error: "Failed to save telemetry" });
  }
});

// Dashboard analytics (cached)
app.get(
  "/analytics/dashboard",
  authMiddleware,
  async (req, res) => {
    try {
      const data = await getDashboardAnalytics(req.user.id);
      res.json({ data });
    } catch (err) {
      console.error("Analytics error:", err);
      res.status(500).json({ error: "Analytics failed" });
    }
  }
);

// Project analytics
app.get(
  "/analytics/project/:id",
  authMiddleware,
  async (req, res) => {
    try {
      const data = await getProjectAnalytics(req.params.id);
      res.json({ data });
    } catch (err) {
      console.error("Project analytics error:", err);
      res.status(500).json({ error: "Analytics failed" });
    }
  }
);

// Traffic analytics
app.get("/project/:id/traffic", authMiddleware, async (req, res) => {
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



// deploy
app.post("/deploy", authMiddleware, async (req, res) => {
  try {
    const { projectId, branch } = req.body;
    if (!projectId) return res.status(400).json({ error: "projectId required" });

    const deployBranch = branch || "main";

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.user.id },
      include: { environmentVariables: true },
    });

    if (!project) return res.status(404).json({ error: "Project not found" });

    // 1. Check deployments
    const deployments = await prisma.deployment.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" }, // oldest first
    });

    let deletedDeploymentId = null;

    // 2. If already 3 deployments → delete oldest
    if (deployments.length >= 3) {
      const oldest = deployments[0];
      deletedDeploymentId = oldest.id;

      console.log("Max deployments reached. Deleting oldest:", oldest.id);

      // ---- Delete from S3 ----
      const s3 = new S3Client({ region: "us-east-1" });
      const prefix = `__outputs/${project.id}/${oldest.id}/`;

      const listed = await s3.send(
        new ListObjectsV2Command({
          Bucket: "vercel-clone-ws",
          Prefix: prefix,
        })
      );

      if (listed.Contents?.length) {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: "vercel-clone-ws",
            Delete: {
              Objects: listed.Contents.map(obj => ({ Key: obj.Key })),
            },
          })
        );
      }

      // ---- Delete from DB ----
      await prisma.deployment.delete({
        where: { id: oldest.id },
      });
    }

    // 3. Create new deployment
    const deployment = await prisma.deployment.create({
      data: {
        projectId: project.id,
        status: "QUEUED",
        isActive: false,
        branch: deployBranch,
        trigger: "MANUAL",
        startedAt: new Date(),
      },
    });

    const userEnvVarsObj = {};
    if (project.environmentVariables) {
      for (const e of project.environmentVariables) {
        userEnvVarsObj[e.key] = decrypt(e.value);
      }
    }

    // 4. Trigger ECS build
    const command = new RunTaskCommand({
      cluster: CLUSTER,
      taskDefinition: TASK,
      launchType: "FARGATE",
      networkConfiguration: {
        awsvpcConfiguration: {
          assignPublicIp: "ENABLED",
          subnets: [
            "subnet-0c880cd48957e3b04",
            "subnet-0a8f5863458162f15",
            "subnet-0df491ac14b434dc5",
          ],
          securityGroups: ["sg-07baa83f9ed7f4ba4"],
        },
      },
      overrides: {
        containerOverrides: [
          {
            name: "builder-image",
            environment: [
              { name: "GIT_REPOSITORY_URL", value: project.gitURL },
              { name: "PROJECT_ID", value: project.id },
              { name: "DEPLOYEMENT_ID", value: deployment.id },
              { name: "BRANCH", value: deployBranch },
              { name: "USER_ENV_VARS", value: JSON.stringify(userEnvVarsObj) },
              { name: "AWS_LAMBDA_ROLE_ARN", value: "arn:aws:iam::097457367826:role/DeployrLambdaExecutionRole" },
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

    res.json({
      data: deployment,
      warning: deletedDeploymentId
        ? `Oldest deployment ${deletedDeploymentId} was deleted to make space`
        : null,
    });
  } catch (err) {
    console.error("Deploy error:", err);
    res.status(500).json({ error: "Deploy failed" });
  }
});




// Undeploy project
app.post("/undeploy", authMiddleware, async (req, res) => {
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

//publish
app.post("/project/:id/publish", authMiddleware, async (req, res) => {
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



//promote
app.post("/deployments/:id/promote", authMiddleware, async (req, res) => {
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
      // 1. Deactivate all deployments of project
      prisma.deployment.updateMany({
        where: { projectId: deployment.projectId },
        data: { isActive: false },
      }),

      // 2. Activate this deployment
      prisma.deployment.update({
        where: { id: deployment.id },
        data: { isActive: true },
      }),

      // 3. Update project pointer + publish project
      prisma.project.update({
        where: { id: deployment.projectId },
        data: {
          latestDeploymentId: deployment.id,
          lastDeployedAt: new Date(),
          deployedAt: deployment.project.deployedAt ?? new Date(),
          isPublished: true, // 👈 critical
        },
      }),
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error("Promote error:", err);
    res.status(500).json({ error: "Failed to promote deployment" });
  }
});



// unpublish (make project fully offline but keep files in S3)
app.post("/projects/:id/unpublish", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!project) {
      return res.status(404).json({ error: "Not found" });
    }

    await prisma.$transaction([
      // 1. Deactivate all deployments
      prisma.deployment.updateMany({
        where: { projectId: project.id },
        data: { isActive: false },
      }),

      // 2. Remove production pointer
      prisma.project.update({
        where: { id: project.id },
        data: {
          latestDeploymentId: null,
          isPublished: false, // 👈 critical
        },
      }),
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error("Unpublish error:", err);
    res.status(500).json({ error: "Failed to unpublish project" });
  }
});


//
app.delete("/deployments/:id", authMiddleware, async (req, res) => {
  const deploymentId = req.params.id;

  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    include: { project: true },
  });

  if (!deployment || deployment.project.userId !== req.user.id) {
    return res.status(404).json({ error: "Not found" });
  }

  const s3 = new S3Client({ region: "us-east-1" });
  const prefix = `__outputs/${deployment.projectId}/${deployment.id}/`;

  const listed = await s3.send(
    new ListObjectsV2Command({
      Bucket: "vercel-clone-ws",
      Prefix: prefix,
    })
  );

  if (listed.Contents?.length) {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: "vercel-clone-ws",
        Delete: {
          Objects: listed.Contents.map(obj => ({ Key: obj.Key })),
        },
      })
    );
  }

  await prisma.deployment.delete({ where: { id: deployment.id } });

  res.json({ success: true });
});



// ---------------- Logs API ----------------
app.get("/logs/:id", authMiddleware, async (req, res) => {
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
      select: {
        log: true,
        timestamp: true,
      },
    });

    res.json({
      logs: rows.map(r => ({
        log: r.log,
        timestamp: r.timestamp.toISOString(),
      })),
      cursor:
        rows.length > 0
          ? rows[rows.length - 1].timestamp.toISOString()
          : null,
    });
  } catch (err) {
    console.error("Fetch logs error:", err);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});


// Single deployment meta (used by logs page)
app.get("/deployment/:id", authMiddleware, async (req, res) => {
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


// List projects (correct multi-deployment + production aware)
app.get("/projects", authMiddleware, async (req, res) => {
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

      // Compute project status properly
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

      // Clean production URL
      const liveUrl = active
        ? p.customDomain && p.domainVerified
          ? `https://${p.customDomain}`
          : `http://${p.slug}.localhost:8000`
        : null;

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        liveUrl,
        status,
        deploymentsCount: p.deployments.length,
      };
    });

    res.json({ data: formatted });
  } catch (err) {
    console.error("Fetch projects error:", err);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});



// Signup
app.post("/auth/signup", async (req, res) => {
  const ip = req.ip;

  if (!rateLimit(`signup-${ip}`, 50, 60_000)) {
    return res.status(429).json({ error: "Too many signups. Try later." });
  }

  const schema = z.object({
    name: z.string().min(2, "Name too short"),
    email: z.string().email("Invalid email"),
    password: z
      .string()
      .min(8, "Must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/[0-9]/, "Must contain a number")
      .regex(/[^A-Za-z0-9]/, "Must contain a symbol"),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(400).json({ error: "Email already in use" });
  }

  const hashed = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      emailVerified: false, // important
    },
  });

  // Create email verification token
  const verifyToken = crypto.randomBytes(32).toString("hex");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      verifyToken,
      verifyTokenExpiry: new Date(Date.now() + 1000 * 60 * 60), // 1 hour
    },
  });

  console.log("Verify email link:");
  console.log(`http://localhost:9000/auth/verify-email?token=${verifyToken}`);

  res.json({
    success: true,
    message: "Signup successful. Please verify your email.",
  });
});


// Login
app.post("/auth/login", async (req, res) => {
  const ip = req.ip;

  if (!rateLimit(`login-${ip}`, 5, 60_000)) {
    return res.status(429).json({ error: "Too many attempts. Try again later." });
  }

  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.password) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // 👇 ADD THIS HERE
  if (!user.emailVerified) {
    return res.status(403).json({ error: "Please verify your email" });
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
  });
});


//pass reset
app.post("/auth/request-password-reset", async (req, res) => {
  const ip = req.ip;

  if (!rateLimit(`reset-${ip}`, 5, 60_000)) {
    return res.status(429).json({ error: "Too many requests. Try later." });
  }

  const { email } = req.body;
  if (!email) return res.json({ success: true });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.json({ success: true });

  const token = crypto.randomBytes(32).toString("hex");

  // 🔥 overwrite old token
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetToken: token,
      resetTokenExpiry: new Date(Date.now() + 1000 * 60 * 10), // 10 min
    },
  });

  console.log(
    `http://localhost:3000/auth/reset-password?token=${token}`
  );

  res.json({ success: true });
});

//
app.post("/auth/reset-password", async (req, res) => {
  const schema = z.object({
  token: z.string(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[0-9]/)
    .regex(/[^A-Za-z0-9]/),
});

const parsed = schema.safeParse(req.body);
if (!parsed.success) return res.status(400).json({ error: "Weak password" });

const { token, password } = parsed.data;


  if (!token || !password) {
    return res.status(400).json({ error: "Missing data" });
  }

  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpiry: { gt: new Date() },
    },
  });

  if (!user) {
    return res.status(400).json({ error: "Invalid or expired token" });
  }

  const hashed = await bcrypt.hash(password, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashed,
      resetToken: null,
      resetTokenExpiry: null,
    },
  });

  res.json({ success: true });
});

// Email verification (must be GET, not POST)
app.get("/auth/verify-email", async (req, res) => {
  try {
    const token = req.query.token;

    if (!token || typeof token !== "string") {
      return res.status(400).send("Invalid verification link");
    }

    const user = await prisma.user.findFirst({
      where: {
        verifyToken: token,
        verifyTokenExpiry: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      return res.status(400).send("Invalid or expired verification link");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verifyToken: null,
        verifyTokenExpiry: null,
      },
    });

    // ✅ AFTER backend success → frontend
    return res.redirect(
      "http://localhost:3000/auth?verified=true"
    );
  } catch (err) {
    console.error(err);
    return res.status(500).send("Verification failed");
  }
});



//...........................
app.get("/auth/me", authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, email: true, name: true, image: true },
  });

  res.json(user);
});


app.post("/auth/oauth-sync", async (req, res) => {
  try {
    const { email, name, image } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    let user = await prisma.user.findUnique({
      where: { email },
    });

    // If user does not exist → create verified OAuth user
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          image,
          emailVerified: true, // OAuth providers already verify emails
        },
      });
    }

    // If user exists but was created via password flow → auto-verify now
    if (user && !user.emailVerified) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
    }

    return res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    });
  } catch (err) {
    console.error("OAuth sync failed:", err);
    res.status(500).json({ error: "OAuth sync failed" });
  }
});


// Delete project (with full cleanup)
app.delete("/project/:id", authMiddleware, async (req, res) => {
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

    const s3 = new S3Client({ region: "us-east-1" });

    // 1. Delete all deployment files from S3
    for (const deployment of project.deployments) {
      const prefix = `__outputs/${project.id}/${deployment.id}/`;

      const listed = await s3.send(
        new ListObjectsV2Command({
          Bucket: "vercel-clone-ws",
          Prefix: prefix,
        })
      );

      if (listed.Contents?.length) {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: "vercel-clone-ws",
            Delete: {
              Objects: listed.Contents.map(obj => ({ Key: obj.Key })),
            },
          })
        );
      }
    }

    // 2. Delete deployments
    await prisma.deployment.deleteMany({
      where: { projectId: project.id },
    });

    // 3. Delete project
    await prisma.project.delete({
      where: { id: project.id },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Delete project error:", err);
    res.status(500).json({ error: "Failed to delete project" });
  }
});


// ---------------- ENV VARS ----------------

app.get("/project/:id/env", authMiddleware, async (req, res) => {
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

app.post("/project/:id/env", authMiddleware, async (req, res) => {
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
        projectId_key: {
          projectId: project.id,
          key: key
        }
      },
      update: { value: encryptedValue },
      create: {
        projectId: project.id,
        key: key,
        value: encryptedValue
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Env save error:", err);
    res.status(500).json({ error: "Failed to save env var" });
  }
});

app.delete("/project/:id/env/:key", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    await prisma.environmentVariable.delete({
      where: {
        projectId_key: {
          projectId: project.id,
          key: req.params.key
        }
      }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete env var" });
  }
});

// Update project
app.patch("/project/:id", authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1).optional(),
      gitURL: z.string().url().optional(),
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

    // Auto redeploy if gitURL changed
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
              subnets: [
                "subnet-0c880cd48957e3b04",
                "subnet-0a8f5863458162f15",
                "subnet-0df491ac14b434dc5",
              ],
              securityGroups: ["sg-07baa83f9ed7f4ba4"],
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
                  { name: "AWS_LAMBDA_ROLE_ARN", value: "arn:aws:iam::097457367826:role/DeployrLambdaExecutionRole" },
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

        console.log(`Auto redeploy triggered for ${project.id}`);
      }
    }

    res.json({ data: updated });
  } catch (err) {
    console.error("Update project error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Add custom domain
app.post("/project/:id/domain", authMiddleware, async (req, res) => {
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

  res.json({
    message: "Add this TXT record to verify domain",
    record: {
      type: "TXT",
      name: `_deployr.${domain}`,
      value: token,
    },
  });
});


//domain verification
app.post("/project/:id/domain/verify", authMiddleware, async (req, res) => {
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

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: "DNS lookup failed" });
  }
});

//delete domain
app.delete("/project/:id/domain", authMiddleware, async (req, res) => {
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

  res.json({ success: true });
});

//
app.post("/auth/resend-verification", async (req, res) => {
  const ip = req.ip;
if (!rateLimit(`verify-${ip}`, 5, 60_000)) {
  return res.status(429).json({ error: "Too many requests" });
}

  const { email } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerified) {
    return res.json({ success: true });
  }

  const token = crypto.randomBytes(32).toString("hex");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      verifyToken: token,
      verifyTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  console.log(
    `Verify email link: http://localhost:3000/auth/verify-email?token=${token}`
  );

  res.json({ success: true });
});



// Unified resolve for subdomain + custom domain
app.get("/resolve/:host", async (req, res) => {
  try {
    const host = req.params.host.toLowerCase();

    // remove port if exists
    const cleanHost = host.split(":")[0];
    const parts = cleanHost.split(".");

    // ---------------------------------------------------
    // 1. Preview URL: deploymentId.projectId.localhost
    // ---------------------------------------------------
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

    // ---------------------------------------------------
    // 2. Production via subdomain or custom domain
    // ---------------------------------------------------
    const subdomain = parts[0];

    const project = await prisma.project.findFirst({
      where: {
        OR: [
          { subDomain: subdomain },
          { customDomain: cleanHost, domainVerified: true },
        ],
      },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // 🔒 NEW: respect publish state
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

//user/profile
app.put("/user/profile", authMiddleware, async (req, res) => {
  const { name } = req.body;

  if (!name || name.trim().length < 2) {
    return res.status(400).json({ error: "Invalid name" });
  }

  await prisma.user.update({
    where: { id: req.user.id },
    data: { name },
  });

  res.json({ success: true });
});

//change pass
app.post("/auth/change-password", authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
  });

  if (!user || !user.password) {
    return res.status(400).json({
      error: "Password change not allowed for this account",
    });
  }

  const valid = await bcrypt.compare(
    currentPassword,
    user.password
  );

  if (!valid) {
    return res.status(400).json({
      error: "Current password is incorrect",
    });
  }

  const hashed = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed },
  });

  res.json({ success: true });
});



// Webhook deploy (with max 3 deployments enforced)
app.post("/webhook/github", async (req, res) => {
  try {
    const payload = req.body;

    const repoUrl = payload.repository?.html_url;
    if (!repoUrl) return res.sendStatus(200);

    const project = await prisma.project.findFirst({
      where: { gitURL: repoUrl },
    });

    if (!project) return res.sendStatus(200);

    const branch = payload.ref?.replace("refs/heads/", "") || "main";
    const commitMessage = payload.head_commit?.message || "New commit pushed";

    // Instead of auto-deploying, emit a real-time event to the project owner
    io.to(`user:${project.userId}`).emit("github_commit_pushed", {
      projectId: project.id,
      projectName: project.name,
      branch,
      commitMessage
    });

    console.log(`Webhook popup triggered for ${project.name} (user:${project.userId})`);
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook deploy error:", err);
    res.sendStatus(500);
  }
});



// ---------------- Start ----------------
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
