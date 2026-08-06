const https = require('https');
const http = require('http');
const { URL } = require('url');

function rawPost(webhookUrl, body) {
  let parsedUrl;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch {
    return Promise.resolve(null);
  }

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'User-Agent': 'Deployr-Webhook/1.0',
    },
    timeout: 5000,
  };

  const lib = parsedUrl.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    const req = lib.request(options, (res) => {
      res.resume();
      resolve({ statusCode: res.statusCode });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// Best-effort auto-detection of a chat-app incoming webhook so users can drop
// their Slack/Discord URL straight into the "notify webhook" field and get a
// readable message, instead of a raw JSON blob with no renderer.
function formatForDestination(webhookUrl, payload) {
  const isSuccess = payload.event === 'deployment.succeeded';
  const emoji = isSuccess ? '✅' : '❌';
  const title = `${emoji} ${payload.projectName}: ${isSuccess ? 'Deployment succeeded' : 'Deployment failed'}`;
  const details = [
    `branch: \`${payload.branch ?? 'unknown'}\``,
    `trigger: \`${payload.trigger ?? 'unknown'}\``,
    payload.url ? `<${payload.url}|View deployment>` : null,
  ].filter(Boolean).join(' · ');

  if (webhookUrl.includes('hooks.slack.com')) {
    return JSON.stringify({ text: `${title}\n${details}` });
  }

  if (webhookUrl.includes('discord.com/api/webhooks') || webhookUrl.includes('discordapp.com/api/webhooks')) {
    return JSON.stringify({
      embeds: [{
        title,
        description: details.replace(/<([^|]+)\|([^>]+)>/, '[$2]($1)'),
        color: isSuccess ? 0x2ecc71 : 0xe74c3c,
      }],
    });
  }

  return JSON.stringify(payload);
}

/**
 * Send a deploy-event notification to a configured webhook URL. Formats the
 * payload for Slack/Discord automatically when the URL matches their
 * incoming-webhook hosts; otherwise sends the raw structured JSON event so
 * any custom integration can consume it directly.
 *
 * @param {string} webhookUrl
 * @param {{ event: string, deploymentId: string, projectName: string, branch?: string, trigger?: string, url?: string, timestamp: string }} payload
 */
async function sendNotifyWebhook(webhookUrl, payload) {
  if (!webhookUrl) return;
  const body = formatForDestination(webhookUrl, payload);
  return rawPost(webhookUrl, body);
}

module.exports = { sendNotifyWebhook };
