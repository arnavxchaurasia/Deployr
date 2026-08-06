'use strict';

const { prisma } = require('../../lib/prisma');

// Monthly build-minute quota per plan. `null` means unlimited.
const BUILD_MINUTES_QUOTA = {
  FREE: 100,
  PRO: 1000,
  ENTERPRISE: null,
};

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function sumBuildMinutes(deploymentWhere) {
  const since = startOfCurrentMonth();

  // DeploymentSignal.deploymentId isn't a Prisma relation, so resolve the
  // relevant deployment ids first, then sum signals for just those.
  const deployments = await prisma.deployment.findMany({
    where: { ...deploymentWhere, createdAt: { gte: since } },
    select: { id: true },
  });
  if (deployments.length === 0) return 0;

  const result = await prisma.deploymentSignal.aggregate({
    _sum: { buildTimeMs: true },
    where: {
      createdAt: { gte: since },
      deploymentId: { in: deployments.map((d) => d.id) },
    },
  });

  return (result._sum.buildTimeMs || 0) / 60000;
}

/**
 * Build minutes consumed so far this month by a single user's own projects
 * (excludes org-owned projects, which pool quota at the org level instead —
 * see checkBuildQuota).
 */
async function getBuildMinutesUsed(userId) {
  return sumBuildMinutes({ project: { userId } });
}

/**
 * Checks whether there's build-minute quota remaining this month for a
 * project's owner. Org-owned projects (project.orgId set) pool usage across
 * every project in that org and bill against the org's plan/seat count,
 * rather than any one member's personal plan — seat-based billing means the
 * team's plan should govern team projects, not whichever member happens to
 * own the project record.
 *
 * @param {{ userId: string, orgId?: string|null }} target
 * @returns {Promise<{ allowed: boolean, used: number, limit: number|null, plan: string }>}
 */
async function checkBuildQuota({ userId, orgId = null }) {
  if (orgId) {
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } });
    const plan = org?.plan || 'FREE';
    const limit = BUILD_MINUTES_QUOTA[plan] ?? BUILD_MINUTES_QUOTA.FREE;

    if (limit == null) return { allowed: true, used: 0, limit: null, plan };

    const used = await sumBuildMinutes({ project: { orgId } });
    return { allowed: used < limit, used, limit, plan };
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  const plan = user?.plan || 'FREE';
  const limit = BUILD_MINUTES_QUOTA[plan] ?? BUILD_MINUTES_QUOTA.FREE;

  if (limit == null) {
    return { allowed: true, used: 0, limit: null, plan };
  }

  const used = await getBuildMinutesUsed(userId);
  return { allowed: used < limit, used, limit, plan };
}

module.exports = { BUILD_MINUTES_QUOTA, checkBuildQuota, getBuildMinutesUsed, sumBuildMinutes };
