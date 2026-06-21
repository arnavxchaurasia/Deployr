// analytics.js
const { prisma } = require("../../lib/prisma");

/* ------------------------------------------------
   In-memory cache (safe, simple)
------------------------------------------------ */
const cache = new Map();
const TTL = 60 * 1000; // 1 minute

function cacheKey(userId, projectId) {
  if (projectId) return `project:${projectId}`;
  return `dashboard:${userId}`;
}

function invalidateAnalytics(userId, projectId) {
  if (projectId) {
    cache.delete(cacheKey(null, projectId));
  }
  if (userId) {
    cache.delete(cacheKey(userId, null));
  }
}

/* ------------------------------------------------
   Helpers
------------------------------------------------ */
function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[idx] ?? null;
}

function buildTrend(signals) {
  const map = new Map();

  for (const s of signals) {
    if (typeof s.buildTimeMs !== "number") continue;

    const day = s.createdAt.toISOString().slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(s.buildTimeMs);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date,
      avgMs: Math.round(
        values.reduce((a, b) => a + b, 0) / values.length
      ),
    }));
}

/* ------------------------------------------------
   DASHBOARD ANALYTICS (last 7 days)
------------------------------------------------ */
async function getDashboardAnalytics(userId) {
  const key = cacheKey(userId, null);
  const cached = cache.get(key);

  if (cached && Date.now() - cached.ts < TTL) {
    return cached.data;
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const deployments = await prisma.deployment.findMany({
    where: {
      project: { userId },
      createdAt: { gte: since }, // 🔴 FIX (was finishedAt)
    },
    select: { id: true },
  });

  const deploymentIds = deployments.map(d => d.id);

  // 2️⃣ Fetch total requests for user's projects in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const projects = await prisma.project.findMany({
    where: { userId },
    select: { id: true },
  });
  const projectIds = projects.map(p => p.id);

  const requestLogs = await prisma.requestLog.findMany({
    where: {
      projectId: { in: projectIds },
      timestamp: { gte: thirtyDaysAgo },
    },
    select: {
      status: true,
      latencyMs: true,
      cached: true,
    }
  });

  const totalRequests = requestLogs.length;
  const successfulRequests = requestLogs.filter(l => l.status >= 200 && l.status < 400).length;
  const successRate = totalRequests > 0 ? Math.round((successfulRequests / totalRequests) * 100) : 0;
  
  const cachedRequests = requestLogs.filter(l => l.cached).length;
  const cacheHitRate = totalRequests > 0 ? Math.round((cachedRequests / totalRequests) * 100) : 0;

  const totalLatencyMs = requestLogs.reduce((sum, log) => sum + log.latencyMs, 0);
  const avgLatencyMs = totalRequests > 0 ? Math.round(totalLatencyMs / totalRequests) : 0;

  // If no deployments, return empty analytics but include totalRequests
  if (deploymentIds.length === 0) {
    const empty = {
      avgMs: null,
      p95Ms: null,
      p99Ms: null,
      deploymentsCount: 0,
      trend: [],
      totalRequests,
      successRate,
      cacheHitRate,
      avgLatencyMs,
    };
    cache.set(key, { ts: Date.now(), data: empty });
    return empty;
  }

  // 3️⃣ Fetch build-time signals
  const signals = await prisma.deploymentSignal.findMany({
    where: {
      deploymentId: { in: deploymentIds },
      buildTimeMs: { not: null },
    },
    select: {
      buildTimeMs: true,
      createdAt: true,
    },
  });

  const times = signals
    .map(s => s.buildTimeMs)
    .filter(v => typeof v === "number");

  const data = {
    avgMs:
      times.length > 0
        ? Math.round(
            times.reduce((a, b) => a + b, 0) / times.length
          )
        : null,
    p95Ms: percentile(times, 95),
    p99Ms: percentile(times, 99),
    deploymentsCount: deploymentIds.length,
    trend: buildTrend(signals),
    totalRequests,
    successRate,
    cacheHitRate,
    avgLatencyMs,
  };

  cache.set(key, { ts: Date.now(), data });
  return data;
}

/* ------------------------------------------------
   PROJECT ANALYTICS (single project)
------------------------------------------------ */
async function getProjectAnalytics(projectId) {
  const key = cacheKey(null, projectId);
  const cached = cache.get(key);

  if (cached && Date.now() - cached.ts < TTL) {
    return cached.data;
  }

  const deployments = await prisma.deployment.findMany({
    where: { projectId },
    select: {
      id: true,
      status: true,
    },
  });

  if (deployments.length === 0) {
    const empty = {
      totalDeployments: 0,
      success: 0,
      failed: 0,
      avgBuildMs: null,
    };
    cache.set(key, { ts: Date.now(), data: empty });
    return empty;
  }

  const deploymentIds = deployments.map(d => d.id);

  const signals = await prisma.deploymentSignal.findMany({
    where: {
      deploymentId: { in: deploymentIds },
      buildTimeMs: { not: null },
    },
    select: { buildTimeMs: true },
  });

  const success = deployments.filter(d => d.status === "READY").length;
  const failed = deployments.filter(d => d.status === "FAILED").length;

  const buildTimes = signals
    .map(s => s.buildTimeMs)
    .filter(v => typeof v === "number");

  const data = {
    totalDeployments: deployments.length,
    success,
    failed,
    avgBuildMs:
      buildTimes.length > 0
        ? Math.round(
            buildTimes.reduce((a, b) => a + b, 0) /
              buildTimes.length
          )
        : null,
  };

  cache.set(key, { ts: Date.now(), data });
  return data;
}

/* ------------------------------------------------
   TRAFFIC ANALYTICS (single project)
------------------------------------------------ */
async function getTrafficAnalytics(projectId) {
  const key = `traffic:${projectId}`;
  const cached = cache.get(key);

  if (cached && Date.now() - cached.ts < TTL) {
    return cached.data;
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days

  const logs = await prisma.requestLog.findMany({
    where: {
      projectId,
      timestamp: { gte: since }
    },
    select: {
      timestamp: true,
      status: true,
      latencyMs: true,
      cached: true,
      path: true,
      country: true
    }
  });

  const totalRequests = logs.length;
  const cachedRequests = logs.filter(l => l.cached).length;
  const cacheHitRate = totalRequests > 0 ? Math.round((cachedRequests / totalRequests) * 100) : 0;
  
  const successfulRequests = logs.filter(l => l.status >= 200 && l.status < 400).length;
  const successRate = totalRequests > 0 ? Math.round((successfulRequests / totalRequests) * 100) : 0;

  // Time-series trend (requests per day)
  const trendMap = new Map();
  const pathMap = new Map();
  const countryMap = new Map();

  for (const l of logs) {
    const day = l.timestamp.toISOString().slice(0, 10);
    trendMap.set(day, (trendMap.get(day) || 0) + 1);

    pathMap.set(l.path, (pathMap.get(l.path) || 0) + 1);
    
    if (l.country) {
      countryMap.set(l.country, (countryMap.get(l.country) || 0) + 1);
    }
  }

  const trend = [...trendMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, requests: count }));

  const topPaths = [...pathMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path, count]) => ({ path, count }));

  const topCountries = [...countryMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([country, count]) => ({ country, count }));

  const data = {
    totalRequests,
    cacheHitRate,
    successRate,
    trend,
    topPaths,
    topCountries
  };

  cache.set(key, { ts: Date.now(), data });
  return data;
}

module.exports = {
  getDashboardAnalytics,
  getProjectAnalytics,
  getTrafficAnalytics,
  invalidateAnalytics,
};
