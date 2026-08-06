const { Kafka } = require("kafkajs");
const fs = require("fs");
const path = require("path");
const { prisma } = require("../../lib/prisma");
const logger = require("../../lib/logger");
const { invalidateAnalytics } = require("../services/analyticsService");
const { processTelemetry } = require("../services/aiService");
const { upsertPRComment, setCommitStatus } = require("./githubService");
const { resolveGithubToken } = require("./githubAppService");
const { publishLog, publishStatus } = require("../utils/logBus");
const { sendNotifyWebhook } = require("./notifyWebhookService");
const mailService = require("./mailService");
const { runSmokeTest } = require("./smokeTestService");
const { notify } = require("./notificationService");

const APP_URL = process.env.APP_URL || 'http://localhost:8000';
const FRONTEND_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

// Fallback for projects created before githubOwner/githubRepo were persisted at creation time.
function resolveGithubOwnerRepo(project) {
  if (project?.githubOwner && project?.githubRepo) {
    return { owner: project.githubOwner, repo: project.githubRepo };
  }
  const match = project?.gitURL?.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/i);
  return match ? { owner: match[1], repo: match[2] } : { owner: null, repo: null };
}

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
        logger.error({ raw: message.value.toString() }, "Invalid Kafka message");
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
          logger.error({ err }, "Failed to parse AI telemetry");
        }
        return; // Don't show raw JSON telemetry in the user's log dashboard
      }

      logger.info(`LOG: ${DEPLOYEMENT_ID} ${log}`);

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

      publishLog(DEPLOYEMENT_ID, { log, timestamp: timestamp.toISOString() });

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

      // "FUNCTION_URL:<name>:<url>" — one line per deployed functions/*.js file.
      // Persisted instead of left for the frontend to re-parse from raw logs,
      // which breaks once log retention prunes the build log.
      if (log.startsWith("FUNCTION_URL:")) {
        const rest = log.slice("FUNCTION_URL:".length);
        const sep = rest.indexOf(":");
        if (sep !== -1) {
          const fnName = rest.slice(0, sep).trim();
          const fnUrl = rest.slice(sep + 1).trim();
          if (fnName && fnUrl) {
            const current = await prisma.deployment.findUnique({
              where: { id: DEPLOYEMENT_ID },
              select: { functionUrls: true },
            });
            const merged = { ...(current?.functionUrls || {}), [fnName]: fnUrl };
            await prisma.deployment.update({
              where: { id: DEPLOYEMENT_ID },
              data: { functionUrls: merged },
            });
          }
        }
      }

      const isBuildFinished = lower.includes("build complete") || lower.includes("build finished") || lower.includes("done");

      if (isBuildFinished) {
        const deployment = await prisma.deployment.findUnique({
          where: { id: DEPLOYEMENT_ID },
          select: {
            projectId: true, status: true, startedAt: true, trigger: true, branch: true,
            prNumber: true, isPreview: true, previewSubdomain: true, functionUrl: true, commitHash: true,
            project: {
              select: {
                githubOwner: true, githubRepo: true, gitURL: true, slug: true, name: true,
                notifyWebhookUrl: true, smokeTestPath: true,
                user: { select: { id: true, githubToken: true, githubAppInstallationId: true, email: true, name: true } }
              }
            }
          },
        });

        if (!deployment || deployment.status === "READY" || deployment.status === "FAILED") return;

        const finishedAt = new Date();
        const buildTimeMs = deployment.startedAt ? finishedAt.getTime() - deployment.startedAt.getTime() : null;

        if (deployment.project?.smokeTestPath) {
          const smoke = await runSmokeTest(
            { id: DEPLOYEMENT_ID, projectId: deployment.projectId, functionUrl: deployment.functionUrl },
            deployment.project.smokeTestPath
          );

          if (!smoke.passed) {
            const failed = await prisma.deployment.updateMany({
              where: { id: DEPLOYEMENT_ID, status: { notIn: ["READY", "FAILED"] } },
              data: { status: "FAILED", finishedAt },
            });
            if (failed.count > 0) {
              publishStatus(DEPLOYEMENT_ID, "FAILED");
              publishLog(DEPLOYEMENT_ID, {
                log: `[Smoke Test] FAILED — ${smoke.url} returned ${smoke.statusCode ?? smoke.error}. Deployment blocked from going live.`,
                timestamp: finishedAt.toISOString(),
              });
              await prisma.deploymentSignal.create({ data: { deploymentId: DEPLOYEMENT_ID, buildTimeMs } }).catch(() => {});
              try { invalidateAnalytics(null, deployment.projectId); } catch {}
              logger.warn(`Smoke test failed for ${DEPLOYEMENT_ID}: ${smoke.url} -> ${smoke.statusCode ?? smoke.error}`);
              if (deployment.project?.user?.id) {
                notify(deployment.project.user.id, {
                  type: 'deployment.failed',
                  title: `${deployment.project.name}: smoke test failed`,
                  body: `Branch ${deployment.branch} — the deployment was blocked from going live.`,
                  meta: { deploymentId: DEPLOYEMENT_ID, projectId: deployment.projectId },
                });
              }
              if (deployment.project?.user?.email) {
                const logsUrl = `${FRONTEND_URL}/dashboard/logs/${DEPLOYEMENT_ID}`;
                mailService.sendDeploymentFailureEmail(
                  deployment.project.user.email, deployment.project.name, DEPLOYEMENT_ID, logsUrl
                ).catch(() => {});
              }
              if (deployment.project?.notifyWebhookUrl) {
                sendNotifyWebhook(deployment.project.notifyWebhookUrl, {
                  event: "deployment.failed",
                  deploymentId: DEPLOYEMENT_ID,
                  projectName: deployment.project.name,
                  branch: deployment.branch,
                  trigger: deployment.trigger,
                  url: `${FRONTEND_URL}/dashboard/logs/${DEPLOYEMENT_ID}`,
                  timestamp: finishedAt.toISOString(),
                }).catch(() => {});
              }
              {
                const { owner, repo } = resolveGithubOwnerRepo(deployment.project);
                if (deployment.commitHash && owner && repo && (deployment.project?.user?.githubToken || deployment.project?.user?.githubAppInstallationId)) {
                  const token = await resolveGithubToken(deployment.project.user);
                  setCommitStatus(owner, repo, deployment.commitHash, 'failure', {
                    targetUrl: `${FRONTEND_URL}/dashboard/logs/${DEPLOYEMENT_ID}`,
                    description: 'Smoke test failed',
                  }, token).catch(() => {});
                }
              }
            }
            return;
          }

          publishLog(DEPLOYEMENT_ID, {
            log: `[Smoke Test] Passed — ${smoke.url} returned ${smoke.statusCode}`,
            timestamp: new Date().toISOString(),
          });
        }

        const updated = await prisma.deployment.updateMany({
          where: { id: DEPLOYEMENT_ID, status: { notIn: ["READY", "FAILED"] } },
          data: { status: "READY", isActive: true, finishedAt },
        });

        if (updated.count === 0) return; // Handled by another consumer instance

        publishStatus(DEPLOYEMENT_ID, "READY");

        if (deployment.project?.user?.email) {
          const successUrl = `${APP_URL}/?project=${deployment.project.slug}`;
          mailService.sendDeploymentSuccessEmail(
            deployment.project.user.email, deployment.project.name, DEPLOYEMENT_ID, successUrl
          ).catch(() => {});
        }
        if (deployment.project?.user?.id) {
          notify(deployment.project.user.id, {
            type: 'deployment.succeeded',
            title: `${deployment.project.name}: deployment ready`,
            body: `Branch ${deployment.branch} deployed successfully.`,
            meta: { deploymentId: DEPLOYEMENT_ID, projectId: deployment.projectId },
          });
        }
        if (deployment.project?.notifyWebhookUrl) {
          sendNotifyWebhook(deployment.project.notifyWebhookUrl, {
            event: "deployment.succeeded",
            deploymentId: DEPLOYEMENT_ID,
            projectName: deployment.project.name,
            branch: deployment.branch,
            trigger: deployment.trigger,
            url: `${APP_URL}/?project=${deployment.project.slug}&deployment=${DEPLOYEMENT_ID}`,
            timestamp: finishedAt.toISOString(),
          }).catch(() => {});
        }

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
        logger.info(`Deployment promoted: ${DEPLOYEMENT_ID}`);

        // Debug fallback log
        if (deployment.trigger === "WEBHOOK") {
          logger.info("=================================");
          logger.info("[GITHUB PR COMMENT - SUCCESS]");
          logger.info("Preview Deployment Ready");
          logger.info(`Branch: ${deployment.branch}`);
          logger.info(`URL: ${process.env.APP_URL || "http://localhost:8000"}/?project=${deployment.project?.slug}&deployment=${DEPLOYEMENT_ID}`);
          logger.info("=================================");
        }

        // Post real GitHub PR comment for preview deployments
        {
          const { owner, repo } = resolveGithubOwnerRepo(deployment.project);
          if (deployment.isPreview && deployment.prNumber && owner && repo && (deployment.project?.user?.githubToken || deployment.project?.user?.githubAppInstallationId)) {
            const previewUrl = `${process.env.APP_URL || 'http://localhost:8000'}/?project=${deployment.project.slug}&deployment=${DEPLOYEMENT_ID}`;
            const body = `### ✅ Preview Deployment Ready

Your changes on branch \`${deployment.branch}\` have been deployed.

| | |
|---|---|
| **Preview URL** | [${previewUrl}](${previewUrl}) |
| **Deployment ID** | \`${DEPLOYEMENT_ID.slice(0, 8)}\` |

*Deployed by [Deployr](https://deployr.app)*`;

            const decryptedToken = await resolveGithubToken(deployment.project.user);
            upsertPRComment(owner, repo, deployment.prNumber, body, decryptedToken)
              .then(() => {
                logger.info(`PR success comment posted: ${DEPLOYEMENT_ID}`);
              }).catch((err) => {
                logger.error({ err }, "Failed to post PR success comment");
              });
          }
        }

        // Commit status — separate from the PR comment above: applies to
        // every commit with a hash (not just preview/PR deploys), since
        // teams commonly gate merges on check status regardless of whether
        // the branch has an open PR.
        {
          const { owner, repo } = resolveGithubOwnerRepo(deployment.project);
          if (deployment.commitHash && owner && repo && (deployment.project?.user?.githubToken || deployment.project?.user?.githubAppInstallationId)) {
            const token = await resolveGithubToken(deployment.project.user);
            const url = `${process.env.APP_URL || 'http://localhost:8000'}/?project=${deployment.project.slug}&deployment=${DEPLOYEMENT_ID}`;
            setCommitStatus(owner, repo, deployment.commitHash, 'success', {
              targetUrl: url,
              description: 'Deployment succeeded',
            }, token).catch(() => {});
          }
        }

        return;
      }

      const isBuildFailed = lower.includes("build failed") || lower.includes("command failed") || lower.includes("exit code") || lower.includes("fatal") || lower.includes("uncaught exception");

      if (isBuildFailed) {
        const deployment = await prisma.deployment.findUnique({
          where: { id: DEPLOYEMENT_ID },
          select: {
            projectId: true, status: true, startedAt: true, trigger: true, branch: true,
            prNumber: true, isPreview: true, previewSubdomain: true, commitHash: true,
            project: {
              select: {
                githubOwner: true, githubRepo: true, gitURL: true, slug: true, name: true,
                notifyWebhookUrl: true,
                user: { select: { id: true, githubToken: true, githubAppInstallationId: true, email: true, name: true } }
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
          publishStatus(DEPLOYEMENT_ID, "FAILED");

          if (deployment.project?.user?.email) {
            const logsUrl = `${FRONTEND_URL}/dashboard/logs/${DEPLOYEMENT_ID}`;
            mailService.sendDeploymentFailureEmail(
              deployment.project.user.email, deployment.project.name, DEPLOYEMENT_ID, logsUrl
            ).catch(() => {});
          }
          if (deployment.project?.user?.id) {
            notify(deployment.project.user.id, {
              type: 'deployment.failed',
              title: `${deployment.project.name}: build failed`,
              body: `Branch ${deployment.branch} failed to build.`,
              meta: { deploymentId: DEPLOYEMENT_ID, projectId: deployment.projectId },
            });
          }
          if (deployment.project?.notifyWebhookUrl) {
            sendNotifyWebhook(deployment.project.notifyWebhookUrl, {
              event: "deployment.failed",
              deploymentId: DEPLOYEMENT_ID,
              projectName: deployment.project.name,
              branch: deployment.branch,
              trigger: deployment.trigger,
              url: `${FRONTEND_URL}/dashboard/logs/${DEPLOYEMENT_ID}`,
              timestamp: finishedAt.toISOString(),
            }).catch(() => {});
          }

          await prisma.deploymentSignal.create({
            data: { deploymentId: DEPLOYEMENT_ID, buildTimeMs },
          });

          try { invalidateAnalytics(null, deployment.projectId); } catch {}
          logger.info(`Deployment FAILED: ${DEPLOYEMENT_ID}`);

          // Debug fallback log
          if (deployment.trigger === "WEBHOOK") {
            logger.info("=================================");
            logger.info("[GITHUB PR COMMENT - FAILED]");
            logger.info("Preview Deployment Failed");
            logger.info(`Branch: ${deployment.branch}`);
            logger.info(`Logs: ${process.env.NEXTAUTH_URL || "http://localhost:3000"}/dashboard/logs/${DEPLOYEMENT_ID}`);
            logger.info("=================================");
          }

          // Post real GitHub PR comment for preview deployments
          {
            const { owner, repo } = resolveGithubOwnerRepo(deployment.project);
            if (deployment.isPreview && deployment.prNumber && owner && repo && (deployment.project?.user?.githubToken || deployment.project?.user?.githubAppInstallationId)) {
              const logsUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/dashboard/logs/${DEPLOYEMENT_ID}`;
              const body = `### ❌ Preview Deployment Failed

The deployment for branch \`${deployment.branch}\` failed.

[View build logs](${logsUrl})

*Deployed by [Deployr](https://deployr.app)*`;

              const decryptedToken = await resolveGithubToken(deployment.project.user);
              upsertPRComment(owner, repo, deployment.prNumber, body, decryptedToken)
                .then(() => {
                  logger.info(`PR failure comment posted: ${DEPLOYEMENT_ID}`);
                }).catch((err) => {
                  logger.error({ err }, "Failed to post PR failure comment");
                });
            }
          }

          {
            const { owner, repo } = resolveGithubOwnerRepo(deployment.project);
            if (deployment.commitHash && owner && repo && (deployment.project?.user?.githubToken || deployment.project?.user?.githubAppInstallationId)) {
              const token = await resolveGithubToken(deployment.project.user);
              const logsUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/dashboard/logs/${DEPLOYEMENT_ID}`;
              setCommitStatus(owner, repo, deployment.commitHash, 'failure', {
                targetUrl: logsUrl,
                description: 'Deployment failed',
              }, token).catch(() => {});
            }
          }
        }
      }
    },
  });
}

module.exports = { initKafkaConsumer };