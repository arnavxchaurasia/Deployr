const { prisma } = require('../../lib/prisma');
const logger = require('../../lib/logger');

const TIMEOUT_MS = parseInt(process.env.BUILD_TIMEOUT_MS || String(30 * 60 * 1000), 10); // 30 min default
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // check every 5 min

async function timeoutStalledBuilds() {
  try {
    const stuckBefore = new Date(Date.now() - TIMEOUT_MS);

    const stalled = await prisma.deployment.findMany({
      where: {
        status: 'BUILDING',
        startedAt: { lt: stuckBefore },
      },
      select: { id: true, projectId: true, startedAt: true },
    });

    if (stalled.length === 0) return;

    logger.warn({ count: stalled.length }, 'Timing out stalled builds');

    await prisma.deployment.updateMany({
      where: { id: { in: stalled.map(d => d.id) } },
      data: { status: 'FAILED', finishedAt: new Date() },
    });

    for (const d of stalled) {
      logger.warn({ deploymentId: d.id, projectId: d.projectId, startedAt: d.startedAt }, 'Build timed out');
    }
  } catch (err) {
    logger.error({ err }, 'Build timeout job failed');
  }
}

function startBuildTimeoutJob() {
  // Run once at startup, then on interval
  timeoutStalledBuilds();
  const timer = setInterval(timeoutStalledBuilds, CHECK_INTERVAL_MS);
  timer.unref(); // don't block process exit
  logger.info({ timeoutMs: TIMEOUT_MS, intervalMs: CHECK_INTERVAL_MS }, 'Build timeout job started');
  return timer;
}

module.exports = { startBuildTimeoutJob };