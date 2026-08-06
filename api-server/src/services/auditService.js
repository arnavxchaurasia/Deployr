const https = require('https');
const http = require('http');
const { prisma } = require('../../lib/prisma');
const logger = require('../../lib/logger');

// Deliberately not reusing notifyWebhookService.sendNotifyWebhook — its
// Slack/Discord auto-formatter assumes a deployment-shaped payload
// (projectName/branch/trigger/url) and would render an audit event as
// garbage ("✅ undefined: Deployment failed"). Audit export targets a
// SIEM/webhook endpoint, so a plain raw JSON POST is what's actually wanted,
// even on the rare case someone points it at a Slack URL.
function postJson(webhookUrl, payload) {
  return new Promise((resolve) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(webhookUrl);
    } catch {
      return resolve(null);
    }

    const body = JSON.stringify(payload);
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'Deployr-AuditExport/1.0',
        },
        timeout: 5000,
      },
      (res) => { res.resume(); resolve({ statusCode: res.statusCode }); }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

async function forwardToAuditExport(event) {
  if (!event.projectId) return; // only project-scoped events can be attributed to an org today

  try {
    const project = await prisma.project.findUnique({
      where: { id: event.projectId },
      select: { orgId: true },
    });
    if (!project?.orgId) return;

    const org = await prisma.organization.findUnique({
      where: { id: project.orgId },
      select: { auditExportWebhookUrl: true },
    });
    if (!org?.auditExportWebhookUrl) return;

    await postJson(org.auditExportWebhookUrl, {
      event: 'audit.logged',
      action: event.action,
      userId: event.userId,
      projectId: event.projectId,
      projectName: event.projectName,
      meta: event.meta,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn({ err }, '[AuditLog] Failed to forward event to audit export webhook');
  }
}

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
    logger.error({ err }, '[AuditLog] Failed to write event');
  }

  // Fire-and-forget — export failures must never block the action being audited.
  forwardToAuditExport({ userId, action, projectId, projectName, meta }).catch(() => {});
}

module.exports = { logEvent };
