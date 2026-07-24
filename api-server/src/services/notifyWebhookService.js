const https = require('https');
const http = require('http');
const { URL } = require('url');

async function sendNotifyWebhook(webhookUrl, payload) {
  if (!webhookUrl) return;

  const body = JSON.stringify(payload);
  let parsedUrl;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch {
    return;
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

  return new Promise(resolve => {
    const req = lib.request(options, res => {
      res.resume();
      resolve({ statusCode: res.statusCode });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

module.exports = { sendNotifyWebhook };