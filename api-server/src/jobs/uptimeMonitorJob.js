const https = require('https');
const http = require('http');
const { URL } = require('url');
const { prisma } = require('../../lib/prisma');

const CHECK_INTERVAL_MS = 60 * 1000; // every minute
const REQUEST_TIMEOUT_MS = 10_000;
const APP_URL = process.env.APP_URL || 'http://localhost:8000';

function pingUrl(targetUrl) {
  return new Promise(resolve => {
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return resolve({ up: false, statusCode: null, latencyMs: null });
    }

    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const start = Date.now();

    const req = lib.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'HEAD',
        timeout: REQUEST_TIMEOUT_MS,
        headers: { 'User-Agent': 'Deployr-Uptime/1.0' },
      },
      res => {
        res.resume();
        const latencyMs = Date.now() - start;
        resolve({ up: res.statusCode < 500, statusCode: res.statusCode, latencyMs });
      }
    );

    req.on('timeout', () => { req.destroy(); resolve({ up: false, statusCode: null, latencyMs: REQUEST_TIMEOUT_MS }); });
    req.on('error', () => resolve({ up: false, statusCode: null, latencyMs: Date.now() - start }));
    req.end();
  });
}

async function runUptimeChecks() {
  try {
    // Only check published projects with an active deployment
    const projects = await prisma.project.findMany({
      where: { isPublished: true },
      select: {
        id: true,
        subDomain: true,
        customDomain: true,
        domainVerified: true,
        deployments: {
          where: { isActive: true, status: 'READY' },
          select: { id: true },
          take: 1,
        },
      },
    });

    const active = projects.filter(p => p.deployments.length > 0);
    if (active.length === 0) return;

    const checks = active.map(async p => {
      const url = p.customDomain && p.domainVerified
        ? `https://${p.customDomain}`
        : `${APP_URL}/?project=${p.subDomain}`;

      const result = await pingUrl(url);
      return prisma.uptimeCheck.create({
        data: {
          projectId: p.id,
          up: result.up,
          statusCode: result.statusCode ?? null,
          latencyMs: result.latencyMs ?? null,
        },
      });
    });

    await Promise.allSettled(checks);

    // Prune checks older than 30 days to keep the table small
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await prisma.uptimeCheck.deleteMany({ where: { checkedAt: { lt: cutoff } } });
  } catch (err) {
    console.error('[UptimeMonitor] Check failed:', err);
  }
}

function startUptimeMonitorJob() {
  runUptimeChecks();
  const timer = setInterval(runUptimeChecks, CHECK_INTERVAL_MS);
  timer.unref();
  return timer;
}

module.exports = { startUptimeMonitorJob };