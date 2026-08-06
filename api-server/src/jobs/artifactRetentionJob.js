'use strict';

const { prisma } = require('../../lib/prisma');
const logger = require('../../lib/logger');
const { cleanupDeployment } = require('../services/deploymentCleanupService');

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const MAX_AGE_DAYS = parseInt(process.env.ARTIFACT_MAX_AGE_DAYS || '90', 10);

/**
 * Independent safety net on top of the count-based retention pruning that
 * already runs inline in POST /deploy: that path only fires when a project
 * actually deploys again, so a project that stops deploying (or whose owner
 * never tuned deploymentRetentionCount) can otherwise accumulate S3/Lambda
 * artifacts forever. This sweeps every project periodically and prunes:
 *   1. deployments beyond the project's configured retention count
 *      (re-checked here in case the deploy-time prune was ever skipped)
 *   2. any non-active deployment older than ARTIFACT_MAX_AGE_DAYS, regardless
 *      of count — an age-based backstop for long-idle projects
 * Never touches the active production deployment or anything mid-build.
 */
async function runRetentionSweep() {
  try {
    const projects = await prisma.project.findMany({
      select: { id: true, deploymentRetentionCount: true },
    });

    const maxAgeCutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    let totalPruned = 0;

    for (const project of projects) {
      const deployments = await prisma.deployment.findMany({
        where: { projectId: project.id, status: { notIn: ['QUEUED', 'BUILDING'] }, isActive: false },
        orderBy: { createdAt: 'desc' },
        select: { id: true, projectId: true, functionUrl: true, functionUrls: true, region: true, createdAt: true },
      });

      const retentionCount = project.deploymentRetentionCount ?? 3;
      const beyondRetention = deployments.slice(Math.max(retentionCount - 1, 0));
      const tooOld = deployments.filter((d) => d.createdAt < maxAgeCutoff);

      const toDelete = new Map();
      for (const d of [...beyondRetention, ...tooOld]) toDelete.set(d.id, d);

      for (const deployment of toDelete.values()) {
        try {
          await cleanupDeployment(deployment);
          totalPruned++;
        } catch (err) {
          logger.warn({ err, deploymentId: deployment.id }, '[ArtifactRetention] Failed to prune deployment');
        }
      }
    }

    if (totalPruned > 0) {
      logger.info(`[ArtifactRetention] Pruned ${totalPruned} deployment(s) across ${projects.length} project(s)`);
    }
  } catch (err) {
    logger.error({ err }, '[ArtifactRetention] Sweep failed');
  }
}

function startArtifactRetentionJob() {
  runRetentionSweep();
  const timer = setInterval(runRetentionSweep, CHECK_INTERVAL_MS);
  timer.unref();
  return timer;
}

module.exports = { startArtifactRetentionJob };
