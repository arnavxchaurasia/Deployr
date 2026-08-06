'use strict';

const https = require('https');
const http = require('http');
const logger = require('../../lib/logger');

const REQUEST_TIMEOUT_MS = 20_000; // branching a real database can be slow

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

/**
 * Ask the project's preview-db provisioning webhook to create a database
 * (branch) for this deployment. Returns { envVar, value } to merge into the
 * build's env vars, or null if unconfigured/failed — a provisioning failure
 * should not block the deploy, it just means no preview DB gets injected.
 */
async function provisionPreviewDatabase(webhookUrl, { projectId, deploymentId, branch }) {
  if (!webhookUrl) return null;
  try {
    const result = await postJson(webhookUrl, { action: 'create', projectId, deploymentId, branch });
    if (!result?.envVar || !result?.value) {
      logger.warn(`[PreviewDB] Provisioning webhook for project ${projectId} didn't return { envVar, value }`);
      return null;
    }
    return { envVar: result.envVar, value: result.value };
  } catch (err) {
    logger.warn({ err }, `[PreviewDB] Provisioning failed for deployment ${deploymentId} — continuing without a preview database`);
    return null;
  }
}

/**
 * Tell the provisioning webhook to tear down whatever it created for this
 * deployment. Fire-and-forget from the caller's perspective — never throws.
 */
async function destroyPreviewDatabase(webhookUrl, { projectId, deploymentId }) {
  if (!webhookUrl) return;
  try {
    await postJson(webhookUrl, { action: 'destroy', projectId, deploymentId });
  } catch (err) {
    logger.warn({ err }, `[PreviewDB] Teardown failed for deployment ${deploymentId}`);
  }
}

module.exports = { provisionPreviewDatabase, destroyPreviewDatabase };
