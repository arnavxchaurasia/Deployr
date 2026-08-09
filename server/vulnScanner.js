'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_PACKAGES = 300; // cap the batch — very large monorepos shouldn't block the build on a slow scan

// Reads resolved dependency versions from package-lock.json (npm) if
// present, falling back to package.json's version ranges (less accurate —
// a range like "^4.0.0" is queried as-is, which OSV resolves loosely).
function collectDependencyVersions(workDir) {
  const versions = {}; // name -> version string

  const lockPath = path.join(workDir, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    try {
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      const packages = lock.packages || {};
      for (const [pkgPath, info] of Object.entries(packages)) {
        if (!pkgPath.startsWith('node_modules/') || !info?.version) continue;
        const name = pkgPath.replace(/^node_modules\//, '');
        if (!name.startsWith('.')) versions[name] = info.version;
      }
      if (Object.keys(versions).length) return versions;
    } catch {
      // fall through to package.json below
    }
  }

  const pkgPath = path.join(workDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      for (const [name, range] of Object.entries(deps)) {
        const cleaned = String(range).replace(/^[\^~>=<\s]+/, '');
        if (cleaned && /^\d/.test(cleaned)) versions[name] = cleaned;
      }
    } catch {
      // no package.json, or it's malformed — nothing to scan
    }
  }

  return versions;
}

function postJson(url, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => { chunks += c; });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) return resolve(null);
          try { resolve(JSON.parse(chunks)); } catch { resolve(null); }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(data);
    req.end();
  });
}

/**
 * Queries the OSV.dev database (free, no API key) for known vulnerabilities
 * in this build's resolved npm dependencies. Never throws and never blocks
 * the build — a scanner failure (network down, API rate limit) just means
 * no findings are reported, not a broken deploy.
 *
 * @returns {Promise<{ name: string, version: string, id: string, summary: string }[]>}
 */
async function scanForVulnerabilities(workDir) {
  try {
    const versions = collectDependencyVersions(workDir);
    const names = Object.keys(versions).slice(0, MAX_PACKAGES);
    if (names.length === 0) return [];

    const queries = names.map((name) => ({
      package: { name, ecosystem: 'npm' },
      version: versions[name],
    }));

    const result = await postJson(OSV_BATCH_URL, { queries });
    if (!result?.results) return [];

    const findings = [];
    result.results.forEach((entry, i) => {
      for (const vuln of entry?.vulns || []) {
        findings.push({
          name: names[i],
          version: versions[names[i]],
          id: vuln.id,
          summary: vuln.summary || vuln.details?.slice(0, 200) || 'See osv.dev for details',
        });
      }
    });

    return findings;
  } catch {
    return [];
  }
}

module.exports = { scanForVulnerabilities };
