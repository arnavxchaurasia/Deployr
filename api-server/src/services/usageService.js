'use strict';

const { prisma } = require('../../lib/prisma');
const { sumBuildMinutes, forecastMonthlyUsage, BUILD_MINUTES_QUOTA } = require('./quotaService');

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Real usage numbers for the current calendar month, built only from data
 * this platform actually records — build minutes (DeploymentSignal) and
 * request count/bandwidth/cache-hit-rate (RequestLog). Deliberately does
 * NOT report Lambda invocation counts or S3 storage costs — nothing in the
 * pipeline currently measures those, and a fabricated number would be worse
 * than no number.
 */
async function getProjectUsage(projectId) {
  const since = startOfCurrentMonth();

  const [buildMinutes, requestStats, project] = await Promise.all([
    sumBuildMinutes({ projectId }),
    prisma.requestLog.aggregate({
      where: { projectId, timestamp: { gte: since } },
      _count: { _all: true },
      _sum: { bytes: true },
    }),
    prisma.project.findUnique({ where: { id: projectId }, select: { userId: true, orgId: true } }),
  ]);

  const cachedCount = await prisma.requestLog.count({
    where: { projectId, timestamp: { gte: since }, cached: true },
  });

  const totalRequests = requestStats._count._all;

  const limit = await resolveBuildMinutesLimit(project);

  return {
    since: since.toISOString(),
    buildMinutes: Math.round(buildMinutes * 10) / 10,
    totalRequests,
    bandwidthBytes: requestStats._sum.bytes || 0,
    cacheHitRate: totalRequests > 0 ? Math.round((cachedCount / totalRequests) * 100) : 0,
    forecast: forecastMonthlyUsage(buildMinutes, limit),
  };
}

// Resolves the applicable monthly build-minute limit for a project: its
// org's plan if org-owned (seat-based billing pools usage at the org
// level), else its creator's personal plan.
async function resolveBuildMinutesLimit(project) {
  if (project?.orgId) {
    const org = await prisma.organization.findUnique({ where: { id: project.orgId }, select: { plan: true } });
    return BUILD_MINUTES_QUOTA[org?.plan] ?? BUILD_MINUTES_QUOTA.FREE;
  }
  if (project?.userId) {
    const user = await prisma.user.findUnique({ where: { id: project.userId }, select: { plan: true } });
    return BUILD_MINUTES_QUOTA[user?.plan] ?? BUILD_MINUTES_QUOTA.FREE;
  }
  return BUILD_MINUTES_QUOTA.FREE;
}

/**
 * Same shape, summed across every project in an org — for the org billing
 * page to show usage alongside seats/plan.
 */
async function getOrgUsage(orgId) {
  const since = startOfCurrentMonth();

  const [projects, org] = await Promise.all([
    prisma.project.findMany({ where: { orgId }, select: { id: true } }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } }),
  ]);
  const projectIds = projects.map((p) => p.id);
  const limit = BUILD_MINUTES_QUOTA[org?.plan] ?? BUILD_MINUTES_QUOTA.FREE;

  if (projectIds.length === 0) {
    return { since: since.toISOString(), buildMinutes: 0, totalRequests: 0, bandwidthBytes: 0, cacheHitRate: 0, forecast: forecastMonthlyUsage(0, limit) };
  }

  const [buildMinutes, requestStats, cachedCount] = await Promise.all([
    sumBuildMinutes({ project: { orgId } }),
    prisma.requestLog.aggregate({
      where: { projectId: { in: projectIds }, timestamp: { gte: since } },
      _count: { _all: true },
      _sum: { bytes: true },
    }),
    prisma.requestLog.count({
      where: { projectId: { in: projectIds }, timestamp: { gte: since }, cached: true },
    }),
  ]);

  const totalRequests = requestStats._count._all;

  return {
    since: since.toISOString(),
    buildMinutes: Math.round(buildMinutes * 10) / 10,
    totalRequests,
    bandwidthBytes: requestStats._sum.bytes || 0,
    cacheHitRate: totalRequests > 0 ? Math.round((cachedCount / totalRequests) * 100) : 0,
    forecast: forecastMonthlyUsage(buildMinutes, limit),
  };
}

module.exports = { getProjectUsage, getOrgUsage };
