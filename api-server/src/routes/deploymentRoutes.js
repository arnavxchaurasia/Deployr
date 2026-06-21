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
const { ecsClient, CLUSTER, TASK, RunTaskCommand } = require('../services/awsService');
const mailService = require('../services/mailService');

const router = express.Router();

router.post("/internal/deployments/:id/status", async (req, res) => {
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
      include: {
        project: {
          include: {
            user: true
          }
        }
      }
    });

    if (status === "READY" && deployment.project?.user?.email) {
      const url = `http://localhost:8000/?project=${deployment.project.subDomain}`;
      await mailService.sendDeploymentSuccessEmail(deployment.project.user.email, deployment.project.name, deployment.id, url).catch(console.error);
    } else if (status === "FAILED" && deployment.project?.user?.email) {
      const logsUrl = `http://localhost:3000/dashboard/logs/${deployment.id}`;
      await mailService.sendDeploymentFailureEmail(deployment.project.user.email, deployment.project.name, deployment.id, logsUrl).catch(console.error);
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

router.delete("/deployments/:id", authMiddleware, async (req, res) => {
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