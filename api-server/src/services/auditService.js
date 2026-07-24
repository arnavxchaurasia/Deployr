const { prisma } = require('../../lib/prisma');

async function logEvent(userId, action, { projectId, projectName, meta } = {}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        projectId: projectId ?? null,
        projectName: projectName ?? null,
        meta: meta ?? undefined,
      },
    });
  } catch (err) {
    console.error('[AuditLog] Failed to write event:', err.message);
  }
}

module.exports = { logEvent };