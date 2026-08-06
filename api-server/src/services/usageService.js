'use strict';

const { prisma } = require('../../lib/prisma');
const { sumBuildMinutes } = require('./quotaService');

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

  const [buildMinutes, requestStats] = await Promise.all([
    sumBuildMinutes({ projectId }),
    prisma.requestLog.aggregate({
      where: { projectId, timestamp: { gte: since } },
      _count: { _all: true },
      _sum: { bytes: true },
    }),
  ]);

  const cachedCount = await prisma.requestLog.count({
    where: { projectId, timestamp: { gte: since }, cached: true },
  });

  const totalRequests = requestStats._count._all;

  return {
    since: since.toISOString(),
    buildMinutes: Math.round(buildMinutes * 10) / 10,
    totalRequests,
    bandwidthBytes: requestStats._sum.bytes || 0,
    cacheHitRate: totalRequests > 0 ? Math.round((cachedCount / totalRequests) * 100) : 0,
  };
}

/**
 * Same shape, summed across every project in an org — for the org billing
 * page to show usage alongside seats/plan.
 */
async function getOrgUsage(orgId) {
  const since = startOfCurrentMonth();

  const projects = await prisma.project.findMany({ where: { orgId }, select: { id: true } });
  const projectIds = projects.map((p) => p.id);
  if (projectIds.length === 0) {
    return { since: since.toISOString(), buildMinutes: 0, totalRequests: 0, bandwidthBytes: 0, cacheHitRate: 0 };
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
  };
}

module.exports = { getProjectUsage, getOrgUsage };
