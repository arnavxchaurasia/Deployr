'use strict';

const { prisma } = require('../../lib/prisma');
const logger = require('../../lib/logger');

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily is plenty for a retention sweep

// Purges AuditLog rows older than each org's configured retention window.
// Only project-scoped audit events can be attributed to an org (AuditLog
// has no orgId column, only projectId — see the Organization.
// auditLogRetentionDays schema comment); org-scoped events (member joined/
// left, etc., which carry no projectId) are outside this policy's reach.
async function purgeExpiredAuditLogs() {
  try {
    const orgs = await prisma.organization.findMany({
      where: { auditLogRetentionDays: { not: null } },
      select: { id: true, auditLogRetentionDays: true, projects: { select: { id: true } } },
    });

    for (const org of orgs) {
      if (!org.projects.length) continue;
      const cutoff = new Date(Date.now() - org.auditLogRetentionDays * 24 * 60 * 60 * 1000);

      const result = await prisma.auditLog.deleteMany({
        where: { projectId: { in: org.projects.map((p) => p.id) }, createdAt: { lt: cutoff } },
      });
      if (result.count > 0) {
        logger.info(`[AuditRetention] Purged ${result.count} audit log row(s) for org ${org.id} (older than ${org.auditLogRetentionDays}d)`);
      }
    }
  } catch (err) {
    logger.error({ err }, '[AuditRetention] Purge failed');
  }
}

function startAuditRetentionJob() {
  purgeExpiredAuditLogs();
  const timer = setInterval(purgeExpiredAuditLogs, CHECK_INTERVAL_MS);
  timer.unref();
  return timer;
}

module.exports = { startAuditRetentionJob };
