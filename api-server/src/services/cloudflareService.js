'use strict';

const https = require('https');

const CF_API_HOST = 'api.cloudflare.com';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
// Hostname pointing at the platform's edge (Cloudflare Worker route / origin)
// that customers CNAME their custom domain to.
const CF_FALLBACK_ORIGIN = process.env.CLOUDFLARE_FALLBACK_ORIGIN;

function cfRequest(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: CF_API_HOST,
        port: 443,
        path,
        method: options.method || 'GET',
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let data = null;
          try {
            data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            data = null;
          }
          resolve({ statusCode: res.statusCode, data });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function isConfigured() {
  return Boolean(CF_API_TOKEN && CF_ZONE_ID && CF_FALLBACK_ORIGIN);
}

/**
 * Register a customer's custom domain with Cloudflare for SaaS so Cloudflare
 * automatically issues and renews a TLS certificate for it, without the
 * domain needing to live on Cloudflare's own DNS (customer just CNAMEs to
 * CF_FALLBACK_ORIGIN — Cloudflare validates ownership via that CNAME and
 * issues the cert).
 *
 * @param {string} hostname - the verified custom domain, e.g. "app.customer.com"
 * @returns {Promise<{ id: string, sslStatus: string } | null>} null on failure
 */
async function createCustomHostname(hostname) {
  if (!isConfigured()) return null;
  try {
    const { statusCode, data } = await cfRequest(
      `/client/v4/zones/${CF_ZONE_ID}/custom_hostnames`,
      { method: 'POST' },
      {
        hostname,
        ssl: { method: 'http', type: 'dv' },
      }
    );

    if (statusCode !== 200 && statusCode !== 201) return null;
    const result = data?.result;
    if (!result?.id) return null;

    return { id: result.id, sslStatus: result.ssl?.status || 'pending' };
  } catch {
    return null;
  }
}

/**
 * Poll the current SSL certificate status for a previously-registered
 * custom hostname (e.g. "pending_validation", "pending_issuance", "active").
 */
async function getCustomHostnameStatus(customHostnameId) {
  if (!isConfigured() || !customHostnameId) return null;
  try {
    const { statusCode, data } = await cfRequest(
      `/client/v4/zones/${CF_ZONE_ID}/custom_hostnames/${customHostnameId}`
    );
    if (statusCode !== 200) return null;
    return data?.result?.ssl?.status || null;
  } catch {
    return null;
  }
}

/**
 * Remove a custom hostname registration (called when a customer detaches
 * their domain from a project).
 */
async function deleteCustomHostname(customHostnameId) {
  if (!isConfigured() || !customHostnameId) return false;
  try {
    const { statusCode } = await cfRequest(
      `/client/v4/zones/${CF_ZONE_ID}/custom_hostnames/${customHostnameId}`,
      { method: 'DELETE' }
    );
    return statusCode === 200;
  } catch {
    return false;
  }
}

/**
 * Purge specific URLs from Cloudflare's edge cache — this is the same cache
 * layer backing the Workers Cache API the edge worker uses
 * (`caches.default`), so purging by URL here does clear what the worker
 * cached, not just a separate CDN-only cache.
 *
 * @param {string[]} urls - full URLs, e.g. ["https://example.com/", "https://example.com/about"]
 * @returns {Promise<boolean>} true on success
 */
async function purgeUrls(urls) {
  if (!isConfigured() || !urls?.length) return false;
  try {
    const { statusCode } = await cfRequest(
      `/client/v4/zones/${CF_ZONE_ID}/purge_cache`,
      { method: 'POST' },
      { files: urls }
    );
    return statusCode === 200;
  } catch {
    return false;
  }
}

module.exports = {
  isConfigured,
  createCustomHostname,
  getCustomHostnameStatus,
  deleteCustomHostname,
  purgeUrls,
  CF_FALLBACK_ORIGIN,
};
