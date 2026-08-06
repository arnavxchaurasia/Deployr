'use strict';

const S3_BASE = "https://vercel-clone-ws.s3.us-east-1.amazonaws.com/__outputs";
const TIMEOUT_MS = 15_000;

/**
 * Build the URL to smoke-test a freshly built deployment. Mirrors how the
 * Cloudflare worker routes requests (functionUrl for SSR, otherwise the S3
 * static asset), but bypasses /resolve entirely since the deployment isn't
 * marked READY yet at this point — /resolve would refuse to serve it.
 */
function buildSmokeTestUrl(deployment, path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  if (deployment.functionUrl) {
    return `${deployment.functionUrl.replace(/\/$/, '')}${cleanPath}`;
  }

  const assetPath = cleanPath === '/' ? '/index.html' : cleanPath;
  return `${S3_BASE}/${deployment.projectId}/${deployment.id}${assetPath}`;
}

/**
 * Fetch smokeTestPath against the deployment. Returns { passed, statusCode,
 * error } — never throws.
 */
async function runSmokeTest(deployment, smokeTestPath) {
  const url = buildSmokeTestUrl(deployment, smokeTestPath);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    return { passed: res.status >= 200 && res.status < 400, statusCode: res.status, url };
  } catch (err) {
    return { passed: false, statusCode: null, url, error: err.name === 'AbortError' ? 'Timed out' : err.message };
  }
}

module.exports = { runSmokeTest, buildSmokeTestUrl };
