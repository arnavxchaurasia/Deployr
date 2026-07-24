const express = require('express');
const crypto = require('crypto');
const { prisma } = require('../../lib/prisma');

const router = express.Router();

// Prometheus-compatible text exposition format
// Secured with INTERNAL_SECRET or a dedicated METRICS_TOKEN env var
router.get("/metrics", async (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
  const expected = process.env.METRICS_TOKEN || process.env.INTERNAL_SECRET;

  if (expected) {
    if (!token || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      return res.status(401).send('# Unauthorized\n');
    }
  }

  try {
    const [
      deploymentsByStatus,
      activeCount,
      userCount,
      projectCount,
      buildingCount,
      last24hDeployments,
      failedLast24h,
    ] = await Promise.all([
      prisma.deployment.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.deployment.count({ where: { isActive: true } }),
      prisma.user.count(),
      prisma.project.count(),
      prisma.deployment.count({ where: { status: 'BUILDING' } }),
      prisma.deployment.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
      prisma.deployment.count({
        where: {
          status: 'FAILED',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const lines = [
      '# HELP deployr_deployments_total Deployments by status (all time)',
      '# TYPE deployr_deployments_total gauge',
    ];
    for (const row of deploymentsByStatus) {
      lines.push(`deployr_deployments_total{status="${row.status}"} ${row._count._all}`);
    }

    lines.push(
      '',
      '# HELP deployr_active_deployments Active (live) deployments',
      '# TYPE deployr_active_deployments gauge',
      `deployr_active_deployments ${activeCount}`,

      '',
      '# HELP deployr_building_deployments Deployments currently building',
      '# TYPE deployr_building_deployments gauge',
      `deployr_building_deployments ${buildingCount}`,

      '',
      '# HELP deployr_users_total Registered users',
      '# TYPE deployr_users_total gauge',
      `deployr_users_total ${userCount}`,

      '',
      '# HELP deployr_projects_total Projects',
      '# TYPE deployr_projects_total gauge',
      `deployr_projects_total ${projectCount}`,

      '',
      '# HELP deployr_deployments_last24h Deployments in the last 24 hours',
      '# TYPE deployr_deployments_last24h gauge',
      `deployr_deployments_last24h ${last24hDeployments}`,

      '',
      '# HELP deployr_failed_deployments_last24h Failed deployments in the last 24 hours',
      '# TYPE deployr_failed_deployments_last24h gauge',
      `deployr_failed_deployments_last24h ${failedLast24h}`,
    );

    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(lines.join('\n') + '\n');
  } catch (err) {
    console.error('Metrics error:', err);
    res.status(500).send('# Error collecting metrics\n');
  }
});

module.exports = router;