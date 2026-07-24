const { Kafka } = require("kafkajs");
const fs = require("fs");
const path = require("path");
const { prisma } = require("../../lib/prisma");
const { invalidateAnalytics } = require("../services/analyticsService");
const { processTelemetry } = require("../services/aiService");
const { postPRComment } = require("./githubService");
const { decrypt } = require("../../lib/crypto");

const kafka = new Kafka({
  clientId: "api-server",
  brokers: ["kafka-26f06e40-notesxmait-c472.j.aivencloud.com:20310"],
  ssl: {
    rejectUnauthorized: true,
    ca: [process.env.KAFKA_CA_CERT ? process.env.KAFKA_CA_CERT.replace(/\\n/g, '\n') : fs.readFileSync(path.join(__dirname, "../../kafka-certs/ca.pem"))],
    cert: process.env.KAFKA_SERVICE_CERT ? process.env.KAFKA_SERVICE_CERT.replace(/\\n/g, '\n') : fs.readFileSync(path.join(__dirname, "../../kafka-certs/service.cert")),
    key: process.env.KAFKA_SERVICE_KEY ? process.env.KAFKA_SERVICE_KEY.replace(/\\n/g, '\n') : fs.readFileSync(path.join(__dirname, "../../kafka-certs/service.key")),
    servername: "kafka-26f06e40-notesxmait-c472.j.aivencloud.com",
  },
  connectionTimeout: 15000,
  requestTimeout: 30000,
});

const consumer = kafka.consumer({
  groupId: "api-server-logs-consumer",
});


async function initKafkaConsumer(io) {
  await consumer.connect();

  await consumer.subscribe({
    topics: ["container-logs"],
    fromBeginning: false,
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
      const timestamp = new Date();

      if (log.startsWith("[AI_TELEMETRY] ")) {
        try {
          const telemetryStr = log.replace("[AI_TELEMETRY] ", "").trim();
          const telemetry = JSON.parse(telemetryStr);
          // Fire and forget AI analysis
          processTelemetry(data.PROJECT_ID, DEPLOYEMENT_ID, telemetry);
        } catch (err) {
          console.error("Failed to parse AI telemetry", err);
        }
        return; // Don't show raw JSON telemetry in the user's log dashboard
      }

      console.log("LOG:", DEPLOYEMENT_ID, log);

      await prisma.logEvent.create({
        data: {
          deploymentId: DEPLOYEMENT_ID,
          log,
          timestamp,
        },
      });

      io.to(DEPLOYEMENT_ID).emit("message", {
        log,
        timestamp: timestamp.toISOString(),
      });

      await prisma.deployment.updateMany({
        where: { id: DEPLOYEMENT_ID, status: "QUEUED" },
        data: { status: "BUILDING", startedAt: timestamp },
      });

      if (log.startsWith("LAMBDA_URL: ")) {
        const functionUrl = log.replace("LAMBDA_URL: ", "").trim();
        await prisma.deployment.update({
          where: { id: DEPLOYEMENT_ID },
          data: { functionUrl },
        });
      }

      const isBuildFinished = lower.includes("build complete") || lower.includes("build finished") || lower.includes("done");

      if (isBuildFinished) {
        const deployment = await prisma.deployment.findUnique({
          where: { id: DEPLOYEMENT_ID },
          select: {
            projectId: true, status: true, startedAt: true, trigger: true, branch: true,
            prNumber: true, isPreview: true, previewSubdomain: true,
            project: {
              select: {
                githubOwner: true, githubRepo: true, slug: true,
                user: { select: { githubToken: true, email: true, name: true } }
              }
            }
          },
        });

        if (!deployment || deployment.status === "READY" || deployment.status === "FAILED") return;

        const finishedAt = new Date();
        const buildTimeMs = deployment.startedAt ? finishedAt.getTime() - deployment.startedAt.getTime() : null;

        const updated = await prisma.deployment.updateMany({
          where: { id: DEPLOYEMENT_ID, status: { notIn: ["READY", "FAILED"] } },
          data: { status: "READY", isActive: true, finishedAt },
        });

        if (updated.count === 0) return; // Handled by another consumer instance

        await prisma.$transaction([
          prisma.deploymentSignal.create({
            data: { deploymentId: DEPLOYEMENT_ID, buildTimeMs },
          }),
          prisma.deployment.updateMany({
            where: { projectId: deployment.projectId, NOT: { id: DEPLOYEMENT_ID } },
            data: { isActive: false },
          }),
          prisma.project.update({
            where: { id: deployment.projectId },
            data: { latestDeploymentId: DEPLOYEMENT_ID, deployedAt: finishedAt, lastDeployedAt: finishedAt },
          }),
        ]);

        try { invalidateAnalytics(null, deployment.projectId); } catch {}
        console.log("Deployment promoted:", DEPLOYEMENT_ID);

        // Debug fallback log
        if (deployment.trigger === "WEBHOOK") {
          console.log("\n=================================");
          console.log("[GITHUB PR COMMENT - SUCCESS]");
          console.log("✅ Preview Deployment Ready!");
          console.log(`Branch: ${deployment.branch}`);
          console.log(`URL: ${process.env.APP_URL || 'http://localhost:8000'}/?project=${deployment.project?.slug}&deployment=${DEPLOYEMENT_ID}`);
          console.log("=================================\n");
        }

        // Post real GitHub PR comment for preview deployments
        if (
          deployment.isPreview &&
          deployment.prNumber &&
          deployment.project?.githubOwner &&
          deployment.project?.githubRepo &&
          deployment.project?.user?.githubToken
        ) {
          const previewUrl = `${process.env.APP_URL || 'http://localhost:8000'}/?project=${deployment.project.slug}&deployment=${DEPLOYEMENT_ID}`;
          const body = `### ✅ Preview Deployment Ready

Your changes on branch \`${deployment.branch}\` have been deployed.

| | |
|---|---|
| **Preview URL** | [${previewUrl}](${previewUrl}) |
| **Deployment ID** | \`${DEPLOYEMENT_ID.slice(0, 8)}\` |

*Deployed by [Deployr](https://deployr.app)*`;

          const decryptedToken = decrypt(deployment.project.user.githubToken);
          postPRComment(
            deployment.project.githubOwner,
            deployment.project.githubRepo,
            deployment.prNumber,
            body,
            decryptedToken
          ).then(() => {
            console.log("PR success comment posted:", DEPLOYEMENT_ID);
          }).catch((err) => {
            console.error("Failed to post PR success comment:", err.message);
          });
        }

        return;
      }

      const isBuildFailed = lower.includes("build failed") || lower.includes("command failed") || lower.includes("exit code") || lower.includes("fatal") || lower.includes("uncaught exception");

      if (isBuildFailed) {
        const deployment = await prisma.deployment.findUnique({
          where: { id: DEPLOYEMENT_ID },
          select: {
            projectId: true, status: true, startedAt: true, trigger: true, branch: true,
            prNumber: true, isPreview: true, previewSubdomain: true,
            project: {
              select: {
                githubOwner: true, githubRepo: true, slug: true,
                user: { select: { githubToken: true, email: true, name: true } }
              }
            }
          },
        });

        if (!deployment || deployment.status === "READY" || deployment.status === "FAILED") return;

        const finishedAt = new Date();
        const buildTimeMs = deployment.startedAt ? finishedAt.getTime() - deployment.startedAt.getTime() : null;

        const updated = await prisma.deployment.updateMany({
          where: { id: DEPLOYEMENT_ID, status: { notIn: ["FAILED", "READY"] } },
          data: { status: "FAILED", finishedAt },
        });

        if (updated.count > 0) {
          await prisma.deploymentSignal.create({
            data: { deploymentId: DEPLOYEMENT_ID, buildTimeMs },
          });

          try { invalidateAnalytics(null, deployment.projectId); } catch {}
          console.log("Deployment FAILED:", DEPLOYEMENT_ID);

          // Debug fallback log
          if (deployment.trigger === "WEBHOOK") {
            console.log("\n=================================");
            console.log("[GITHUB PR COMMENT - FAILED]");
            console.log("🚨 Preview Deployment Failed!");
            console.log(`Branch: ${deployment.branch}`);
            console.log(`Logs: ${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/dashboard/logs/${DEPLOYEMENT_ID}`);
            console.log("=================================\n");
          }

          // Post real GitHub PR comment for preview deployments
          if (
            deployment.isPreview &&
            deployment.prNumber &&
            deployment.project?.githubOwner &&
            deployment.project?.githubRepo &&
            deployment.project?.user?.githubToken
          ) {
            const logsUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/dashboard/logs/${DEPLOYEMENT_ID}`;
            const body = `### ❌ Preview Deployment Failed

The deployment for branch \`${deployment.branch}\` failed.

[View build logs](${logsUrl})

*Deployed by [Deployr](https://deployr.app)*`;

            const decryptedToken = decrypt(deployment.project.user.githubToken);
            postPRComment(
              deployment.project.githubOwner,
              deployment.project.githubRepo,
              deployment.prNumber,
              body,
              decryptedToken
            ).then(() => {
              console.log("PR failure comment posted:", DEPLOYEMENT_ID);
            }).catch((err) => {
              console.error("Failed to post PR failure comment:", err.message);
            });
          }
        }
      }
    },
  });
}

module.exports = { initKafkaConsumer };