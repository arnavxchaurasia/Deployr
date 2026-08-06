'use strict';

const { prisma } = require('../../lib/prisma');
const logger = require('../../lib/logger');
const { triggerECSBuild } = require('../services/deployTriggerService');
const { sendNotifyWebhook } = require('../services/notifyWebhookService');
const { sendOrgWebhook } = require('../services/orgWebhookService');
const { logEvent } = require('../services/auditService');
const { notify } = require('../services/notificationService');

const CHECK_INTERVAL_MS = 60 * 1000; // every minute
const CONSECUTIVE_DOWN_CHECKS = 5; // ~5 minutes of sustained downtime before failing over

// Only projects with a failoverRegion configured (opt-in — see Project.failoverRegion
// schema comment) are candidates. A project is only failed over once per
// incident: after triggering a build in failoverRegion we immediately swap
// project.region to it, so a re-run of this job no longer sees region !==
// failoverRegion and won't retrigger.
async function checkFailovers() {
  try {
    const candidates = await prisma.project.findMany({
      where: {
        isPublished: true,
        failoverRegion: { not: null },
      },
      include: { environmentVariables: true },
    });

    for (const project of candidates) {
      if (!project.failoverRegion || project.failoverRegion === project.region) continue;

      const recentChecks = await prisma.uptimeCheck.findMany({
        where: { projectId: project.id },
        orderBy: { checkedAt: 'desc' },
        take: CONSECUTIVE_DOWN_CHECKS,
        select: { up: true },
      });

      if (recentChecks.length < CONSECUTIVE_DOWN_CHECKS) continue; // not enough history to judge yet
      const allDown = recentChecks.every((c) => !c.up);
      if (!allDown) continue;

      await failover(project);
    }
  } catch (err) {
    logger.error({ err }, '[Failover] Check failed');
  }
}

async function failover(project) {
  const fromRegion = project.region;
  const toRegion = project.failoverRegion;

  logger.warn(`[Failover] ${project.name} down for ${CONSECUTIVE_DOWN_CHECKS} consecutive checks — failing over ${fromRegion} → ${toRegion}`);

  // Swap the region first so a concurrent job tick (or a retry after a
  // transient error below) never double-triggers the same failover.
  const updated = await prisma.project.update({
    where: { id: project.id },
    data: { region: toRegion },
  });

  try {
    await triggerECSBuild({
      project: { ...project, region: toRegion },
      branch: project.githubDefaultBranch || 'main',
      commitHash: null,
      trigger: 'REDEPLOY',
    });
  } catch (err) {
    logger.error({ err }, `[Failover] Build trigger failed for ${project.name} — reverting region`);
    await prisma.project.update({ where: { id: project.id }, data: { region: fromRegion } });
    return;
  }

  logEvent(project.userId, 'project.failed_over', {
    projectId: project.id,
    projectName: project.name,
    meta: { fromRegion, toRegion },
  });

  notify(project.userId, {
    type: 'project.failed_over',
    title: `${project.name}: failed over to ${toRegion}`,
    body: `Sustained downtime detected in ${fromRegion} — a new build was triggered in ${toRegion} automatically.`,
    meta: { projectId: project.id, fromRegion, toRegion },
  });

  if (project.notifyWebhookUrl) {
    sendNotifyWebhook(project.notifyWebhookUrl, {
      event: 'project.failed_over',
      projectName: project.name,
      fromRegion,
      toRegion,
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }

  if (updated.orgId) {
    sendOrgWebhook(updated.orgId, 'project.failed_over', {
      projectId: project.id,
      projectName: project.name,
      fromRegion,
      toRegion,
    }).catch(() => {});
  }
}

function startFailoverJob() {
  checkFailovers();
  const timer = setInterval(checkFailovers, CHECK_INTERVAL_MS);
  timer.unref();
  return timer;
}

module.exports = { startFailoverJob };
