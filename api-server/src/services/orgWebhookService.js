const https = require('https');
const http = require('http');
const { prisma } = require('../../lib/prisma');
const logger = require('../../lib/logger');

// Raw JSON POST, same shape as auditService's postJson — org lifecycle
// events aren't deployment-shaped, so no Slack/Discord auto-formatting.
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
          'User-Agent': 'Deployr-OrgWebhook/1.0',
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

// Fire-and-forget — callers should not await this on the request's critical
// path. Looks up the org's webhookUrl itself so call sites only need an
// orgId, event name, and a plain details object.
async function sendOrgWebhook(orgId, event, details = {}) {
  if (!orgId) return;
  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { webhookUrl: true },
    });
    if (!org?.webhookUrl) return;

    await postJson(org.webhookUrl, {
      event,
      orgId,
      ...details,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn({ err }, '[OrgWebhook] Failed to send org webhook');
  }
}

module.exports = { sendOrgWebhook };
