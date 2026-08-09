'use strict';

const https = require('https');
const http = require('http');
const { prisma } = require('../../lib/prisma');
const { encrypt, decrypt } = require('../../lib/crypto');
const logger = require('../../lib/logger');

const REQUEST_TIMEOUT_MS = 20_000; // provisioning a real database can be slow

function postJson(webhookUrl, payload) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(webhookUrl);
    } catch (err) {
      return reject(err);
    }

    const body = JSON.stringify(payload);
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let data = null;
          try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
          else reject(new Error(`Provisioning webhook returned ${res.statusCode}`));
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Provisioning webhook timed out')); });
    req.write(body);
    req.end();
  });
}

// Fire-and-forget: calls the addon's provisioning webhook (if any) to
// create the resource, stores the returned connection string encrypted.
// Never throws — a provisioning failure just leaves the addon "failed"
// rather than blocking whatever request created it.
async function provisionStorageAddon(addonId) {
  const addon = await prisma.storageAddon.findUnique({ where: { id: addonId } });
  if (!addon || !addon.provisionWebhookUrl) return;

  try {
    const result = await postJson(addon.provisionWebhookUrl, { action: 'create', projectId: addon.projectId, addonId: addon.id });
    if (!result?.connectionString) throw new Error('Webhook did not return { connectionString }');

    await prisma.storageAddon.update({
      where: { id: addon.id },
      data: { connectionString: encrypt(result.connectionString), status: 'provisioned' },
    });
  } catch (err) {
    logger.warn({ err }, `[StorageAddon] Provisioning failed for ${addon.id}`);
    await prisma.storageAddon.update({ where: { id: addon.id }, data: { status: 'failed' } }).catch(() => {});
  }
}

async function destroyStorageAddon(addon) {
  if (!addon.provisionWebhookUrl) return;
  try {
    await postJson(addon.provisionWebhookUrl, { action: 'destroy', projectId: addon.projectId, addonId: addon.id });
  } catch (err) {
    logger.warn({ err }, `[StorageAddon] Teardown failed for ${addon.id}`);
  }
}

// Flattened env vars from every provisioned addon on a project, decrypted —
// merged into the build alongside EnvGroup/integration vars.
async function getProjectStorageAddonVars(projectId) {
  const addons = await prisma.storageAddon.findMany({
    where: { projectId, status: 'provisioned', connectionString: { not: null } },
  });

  const env = {};
  for (const addon of addons) {
    env[addon.envVarKey] = decrypt(addon.connectionString);
  }
  return env;
}

module.exports = { provisionStorageAddon, destroyStorageAddon, getProjectStorageAddonVars };
