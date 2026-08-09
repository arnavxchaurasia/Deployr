'use strict';

const { prisma } = require('../../lib/prisma');
const logger = require('../../lib/logger');
const { sendDigestEmail } = require('../services/mailService');

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours — cheap enough to just poll for "is it time yet"
const DIGEST_WEEKDAY = 1; // Monday (UTC), matches Date.getUTCDay()
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FRONTEND_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

async function sendDigests() {
  try {
    const now = new Date();
    if (now.getUTCDay() !== DIGEST_WEEKDAY) return;

    const since = new Date(now.getTime() - WEEK_MS);

    // Only orgs due for a digest — never sent, or last sent more than a
    // week ago (guards against sending twice if the job restarts on the
    // same Monday).
    const orgs = await prisma.organization.findMany({
      where: {
        OR: [{ lastDigestSentAt: null }, { lastDigestSentAt: { lt: since } }],
      },
      include: {
        memberships: { where: { role: { in: ['OWNER', 'ADMIN'] } }, include: { user: { select: { email: true } } } },
        projects: { select: { id: true } },
      },
    });

    for (const org of orgs) {
      if (!org.memberships.length || !org.projects.length) continue;

      const projectIds = org.projects.map((p) => p.id);
      const [deployCount, failedCount] = await Promise.all([
        prisma.deployment.count({ where: { projectId: { in: projectIds }, createdAt: { gte: since } } }),
        prisma.deployment.count({ where: { projectId: { in: projectIds }, createdAt: { gte: since }, status: 'FAILED' } }),
      ]);

      if (deployCount === 0) continue; // nothing to report — skip the noise

      // Notification has no orgId column — budgetAlertJob.js stamps
      // meta.subjectType/subjectId ("org", org.id) on the alerts it sends,
      // so that's the only way to scope this check to THIS org rather than
      // any alert fired for any org whose OWNER/ADMIN happens to overlap.
      const memberUserIds = org.memberships.map((m) => m.userId);
      const recentAlerts = await prisma.notification.findMany({
        where: { userId: { in: memberUserIds }, type: 'usage.budget_alert', createdAt: { gte: since } },
        select: { meta: true },
      });
      const recentBudgetAlert = recentAlerts.some(
        (n) => n.meta?.subjectType === 'org' && n.meta?.subjectId === org.id
      );

      for (const membership of org.memberships) {
        if (!membership.user?.email) continue;
        await sendDigestEmail(membership.user.email, {
          orgName: org.name,
          deployCount,
          failedCount,
          activeProjects: org.projects.length,
          budgetAlert: recentBudgetAlert ? 'Your build-minute budget crossed a threshold this week.' : null,
          dashboardUrl: `${FRONTEND_URL}/dashboard`,
        }).catch((err) => logger.warn({ err }, '[Digest] Failed to send to one recipient'));
      }

      await prisma.organization.update({ where: { id: org.id }, data: { lastDigestSentAt: now } });
    }
  } catch (err) {
    logger.error({ err }, '[Digest] Job failed');
  }
}

function startDigestJob() {
  sendDigests();
  const timer = setInterval(sendDigests, CHECK_INTERVAL_MS);
  timer.unref();
  return timer;
}

module.exports = { startDigestJob };
