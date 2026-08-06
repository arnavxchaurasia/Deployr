const crypto = require('crypto');

// Shared between projectRoutes.js (subscribe/unsubscribe endpoints) and
// uptimeMonitorJob.js (building the unsubscribe link inside incident
// emails) — an HMAC over projectId+email so a subscriber can unsubscribe
// via a plain link with no account/session needed, without the link being
// forgeable to unsubscribe someone else.
function unsubscribeToken(projectId, email) {
  const secret = process.env.NEXTAUTH_SECRET || 'deployr-dev-secret';
  return crypto.createHmac('sha256', secret).update(`${projectId}:${email}`).digest('hex');
}

module.exports = { unsubscribeToken };
