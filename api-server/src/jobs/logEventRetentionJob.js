'use strict';

const { prisma } = require('../../lib/prisma');
const logger = require('../../lib/logger');

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

// Purges LogEvent (build log) rows for projects that have a LogRetentionPolicy.
// Without this, the LogEvent table grows unboundedly as every build streams
// thousands of lines. The default policy (created lazily by logRetentionRoutes)
// is 30 days; projects with no policy row are skipped.
async function purgeExpiredLogEvents() {
  try {
    const policies = await prisma.logRetentionPolicy.findMany({
      select: { projectId: true, retentionDays: true },
    });

    for (const policy of policies) {
      const cutoff = new Date(Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000);

      // Delete via deployment IDs to avoid a full-table scan on LogEvent
      const oldDeployments = await prisma.deployment.findMany({
        where: { projectId: policy.projectId, startedAt: { lt: cutoff } },
        select: { id: true },
      });

      if (!oldDeployments.length) continue;

      const ids = oldDeployments.map((d) => d.id);
      const result = await prisma.logEvent.deleteMany({
        where: { deploymentId: { in: ids } },
      });

      if (result.count > 0) {
        logger.info(
          `[LogEventRetention] Purged ${result.count} log event(s) for project ${policy.projectId} (older than ${policy.retentionDays}d)`
        );
      }
    }
  } catch (err) {
    logger.error({ err }, '[LogEventRetention] Purge failed');
  }
}

function startLogEventRetentionJob() {
  purgeExpiredLogEvents();
  setInterval(purgeExpiredLogEvents, CHECK_INTERVAL_MS);
}

module.exports = { startLogEventRetentionJob };
