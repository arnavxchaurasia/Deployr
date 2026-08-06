'use strict';

const { SignJWT, importPKCS8 } = require('jose');
const https = require('https');

// GitHub App-based auth, offered alongside the existing personal-access-token
// flow (githubService.js) rather than replacing it — a PAT is still simpler
// for a single hobby project, but an App gives org-wide install, fine-grained
// repo permissions, and doesn't break when whoever pasted the PAT leaves.
//
// Requires a GitHub App to be registered once by the operator (this can't be
// automated from here) with env vars:
//   GITHUB_APP_ID            - App ID shown on the app's settings page
//   GITHUB_APP_SLUG           - the app's URL slug, e.g. "deployr-ci"
//   GITHUB_APP_PRIVATE_KEY    - the app's PEM private key (PKCS#8 or PKCS#1)
// and the app's webhook URL pointed at this server's existing /github/webhook
// (it receives push/pull_request events the same as before, plus
// `installation` events this service handles).

const APP_ID = process.env.GITHUB_APP_ID;
const APP_SLUG = process.env.GITHUB_APP_SLUG;
const PRIVATE_KEY_PEM = process.env.GITHUB_APP_PRIVATE_KEY;

function isConfigured() {
  return Boolean(APP_ID && APP_SLUG && PRIVATE_KEY_PEM);
}

function installUrl() {
  if (!APP_SLUG) return null;
  return `https://github.com/apps/${APP_SLUG}/installations/new`;
}

async function signAppJWT() {
  const key = await importPKCS8(PRIVATE_KEY_PEM.replace(/\\n/g, '\n'), 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(now - 60) // allow for clock drift
    .setExpirationTime(now + 9 * 60)
    .setIssuer(APP_ID)
    .sign(key);
}

function githubApiRequest(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: 'api.github.com',
        port: 443,
        path,
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'Deployr-Platform/1.0',
          Accept: 'application/vnd.github+json',
          ...(options.headers || {}),
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let data = null;
          try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { data = null; }
          resolve({ statusCode: res.statusCode, data });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Installation tokens last 1h — cache briefly so a burst of calls for the
// same installation doesn't re-mint a token each time.
const tokenCache = new Map(); // installationId -> { token, expiresAt }

async function getInstallationToken(installationId) {
  if (!isConfigured()) return null;

  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.token;
  }

  try {
    const appJwt = await signAppJWT();
    const { statusCode, data } = await githubApiRequest(
      `/app/installations/${installationId}/access_tokens`,
      { method: 'POST', headers: { Authorization: `Bearer ${appJwt}` } }
    );
    if (statusCode !== 201 || !data?.token) return null;

    tokenCache.set(installationId, { token: data.token, expiresAt: new Date(data.expires_at).getTime() });
    return data.token;
  } catch (err) {
    console.error('[GitHub App] Failed to mint installation token:', err.message);
    return null;
  }
}

/**
 * Resolve the best available GitHub auth token for a user: prefers a
 * GitHub App installation token (if they've installed the app) and falls
 * back to their stored personal access token otherwise.
 *
 * @param {{ githubAppInstallationId?: number|null, githubToken?: string|null }} user
 * @returns {Promise<string|null>}
 */
async function resolveGithubToken(user) {
  const auth = await resolveGithubAuth(user);
  return auth?.token ?? null;
}

/**
 * Same as resolveGithubToken, but also reports whether the token is a
 * GitHub App installation token or a personal access token — callers that
 * list repositories need to know, since installation tokens must call
 * GET /installation/repositories rather than GET /user/repos.
 */
async function resolveGithubAuth(user) {
  if (user?.githubAppInstallationId) {
    const token = await getInstallationToken(user.githubAppInstallationId);
    if (token) return { token, isAppInstallation: true };
    // Installation token mint failed (revoked install, misconfigured app,
    // etc.) — fall through to the PAT if one is also on file.
  }
  if (user?.githubToken) {
    const { decrypt } = require('../../lib/crypto');
    return { token: decrypt(user.githubToken), isAppInstallation: false };
  }
  return null;
}

module.exports = { isConfigured, installUrl, getInstallationToken, resolveGithubToken, resolveGithubAuth };
