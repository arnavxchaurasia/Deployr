'use strict';

const { prisma } = require('../../lib/prisma');
const logger = require('../../lib/logger');
const { sendNotifyWebhook } = require('../services/notifyWebhookService');
const { notify } = require('../services/notificationService');

const CHECK_INTERVAL_MS = 60 * 1000; // every minute
const WINDOW_MS = 5 * 60 * 1000; // look at the last 5 minutes of traffic
const MIN_SAMPLE_SIZE = 20; // don't judge a canary on a handful of requests
const ERROR_RATE_MULTIPLIER = 2; // abort if canary's error rate is 2x the active deployment's
const ERROR_RATE_FLOOR = 0.1; // ...or in absolute terms, if the active side has ~0 errors to compare against

async function errorRate(deploymentId, since) {
  const [total, errors] = await Promise.all([
    prisma.requestLog.count({ where: { deploymentId, timestamp: { gte: since } } }),
    prisma.requestLog.count({ where: { deploymentId, timestamp: { gte: since }, status: { gte: 500 } } }),
  ]);
  return { total, rate: total > 0 ? errors / total : 0 };
}

async function checkCanaries() {
  try {
    const projects = await prisma.project.findMany({
      where: { canaryDeploymentId: { not: null }, canaryPercent: { gt: 0 } },
      select: { id: true, userId: true, name: true, canaryDeploymentId: true, notifyWebhookUrl: true, latestDeploymentId: true },
    });

    if (projects.length === 0) return;

    const since = new Date(Date.now() - WINDOW_MS);

    for (const project of projects) {
      const active = await prisma.deployment.findFirst({
        where: { projectId: project.id, isActive: true, status: 'READY' },
        select: { id: true },
      });
      if (!active) continue;

      const [canaryStats, activeStats] = await Promise.all([
        errorRate(project.canaryDeploymentId, since),
        errorRate(active.id, since),
      ]);

      if (canaryStats.total < MIN_SAMPLE_SIZE) continue; // not enough traffic yet to judge

      const threshold = Math.max(activeStats.rate * ERROR_RATE_MULTIPLIER, ERROR_RATE_FLOOR);
      if (canaryStats.rate <= threshold) continue; // healthy

      // Unhealthy — auto-abort the rollout back to 100% on the active deployment.
      await prisma.project.update({
        where: { id: project.id },
        data: { canaryDeploymentId: null, canaryPercent: 0 },
      });

      logger.warn(
        `[CanaryHealth] Auto-aborted canary for ${project.name}: ` +
        `error rate ${(canaryStats.rate * 100).toFixed(1)}% vs active ${(activeStats.rate * 100).toFixed(1)}% ` +
        `(${canaryStats.total} canary requests sampled)`
      );

      notify(project.userId, {
        type: 'canary.auto_aborted',
        title: `${project.name}: canary auto-aborted`,
        body: `Error rate ${(canaryStats.rate * 100).toFixed(1)}% vs ${(activeStats.rate * 100).toFixed(1)}% on the active deployment — rolled back to 100%.`,
        meta: { projectId: project.id, deploymentId: project.canaryDeploymentId },
      });

      if (project.notifyWebhookUrl) {
        sendNotifyWebhook(project.notifyWebhookUrl, {
          event: 'canary.auto_aborted',
          projectName: project.name,
          deploymentId: project.canaryDeploymentId,
          canaryErrorRate: canaryStats.rate,
          activeErrorRate: activeStats.rate,
          sampleSize: canaryStats.total,
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }
    }
  } catch (err) {
    logger.error({ err }, '[CanaryHealth] Check failed');
  }
}

function startCanaryHealthJob() {
  checkCanaries();
  const timer = setInterval(checkCanaries, CHECK_INTERVAL_MS);
  timer.unref();
  return timer;
}

module.exports = { startCanaryHealthJob };
