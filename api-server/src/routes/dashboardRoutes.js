const express = require('express');
const crypto = require('crypto');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { logEvent } = require('../services/auditService');

const router = express.Router();

// GET /audit-log — paginated audit log for the authenticated user
router.get('/audit-log', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const before = req.query.before; // cursor-based pagination

    const logs = await prisma.auditLog.findMany({
      where: {
        userId: req.user.id,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        projectId: true,
        projectName: true,
        meta: true,
        createdAt: true,
      },
    });

    res.json(logs);
  } catch (err) {
    console.error('Audit log error:', err);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// GET /activity — recent deployments across all user projects
router.get('/activity', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    const deployments = await prisma.deployment.findMany({
      where: {
        project: { userId: req.user.id },
      },
      include: {
        project: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json(deployments.map(d => ({
      id: d.id,
      projectId: d.project.id,
      projectName: d.project.name,
      projectSlug: d.project.slug,
      status: d.status,
      branch: d.branch,
      trigger: d.trigger,
      commitHash: d.commitHash,
      buildTimeMs: d.finishedAt && d.startedAt
        ? d.finishedAt.getTime() - d.startedAt.getTime()
        : null,
      createdAt: d.createdAt,
    })));
  } catch (err) {
    console.error('Activity fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// GET /usage — aggregated request stats across all user projects (last 30 days)
router.get('/usage', authMiddleware, async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const projects = await prisma.project.findMany({
      where: { userId: req.user.id },
      select: { id: true, name: true, slug: true },
    });

    const projectIds = projects.map(p => p.id);

    if (projectIds.length === 0) {
      return res.json({ totalRequests: 0, successRate: 0, avgLatencyMs: 0, cacheHitRate: 0, byProject: [], trend: [] });
    }

    const [totals, byProject, trendRaw] = await Promise.all([
      prisma.requestLog.aggregate({
        where: { projectId: { in: projectIds }, timestamp: { gte: since } },
        _count: { id: true },
        _avg: { latencyMs: true },
      }),
      prisma.requestLog.groupBy({
        by: ['projectId'],
        where: { projectId: { in: projectIds }, timestamp: { gte: since } },
        _count: { id: true },
        _avg: { latencyMs: true },
      }),
      prisma.$queryRaw`
        SELECT
          DATE_TRUNC('day', timestamp) AS day,
          COUNT(*)::int AS requests,
          COUNT(*) FILTER (WHERE cached = true)::int AS cached_hits,
          COUNT(*) FILTER (WHERE status < 400)::int AS successes
        FROM "RequestLog"
        WHERE "projectId" = ANY(${projectIds}::text[])
          AND timestamp >= ${since}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
    ]);

    const successCount = await prisma.requestLog.count({
      where: { projectId: { in: projectIds }, timestamp: { gte: since }, status: { lt: 400 } },
    });
    const cacheCount = await prisma.requestLog.count({
      where: { projectId: { in: projectIds }, timestamp: { gte: since }, cached: true },
    });

    const total = totals._count.id;

    const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));

    res.json({
      totalRequests: total,
      successRate: total > 0 ? Math.round((successCount / total) * 1000) / 10 : 0,
      avgLatencyMs: Math.round(totals._avg.latencyMs || 0),
      cacheHitRate: total > 0 ? Math.round((cacheCount / total) * 1000) / 10 : 0,
      byProject: byProject.map(row => ({
        projectId: row.projectId,
        projectName: projectMap[row.projectId]?.name ?? row.projectId,
        requests: row._count.id,
        avgLatencyMs: Math.round(row._avg.latencyMs || 0),
      })),
      trend: trendRaw.map(row => ({
        date: row.day,
        requests: row.requests,
        cacheHits: row.cached_hits,
        successes: row.successes,
      })),
    });
  } catch (err) {
    console.error('Usage fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

// GET /domains — all custom domains across user's projects
router.get('/domains', authMiddleware, async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: { userId: req.user.id, customDomain: { not: null } },
      select: {
        id: true,
        name: true,
        slug: true,
        customDomain: true,
        domainVerified: true,
        domainVerificationToken: true,
      },
    });

    res.json(projects.map(p => ({
      projectId: p.id,
      projectName: p.name,
      projectSlug: p.slug,
      domain: p.customDomain,
      verified: p.domainVerified,
      verificationToken: p.domainVerificationToken,
    })));
  } catch (err) {
    console.error('Domains fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch domains' });
  }
});

// GET /api-keys
router.get('/api-keys', authMiddleware, async (req, res) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { userId: req.user.id },
      select: { id: true, name: true, prefix: true, scope: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(keys);
  } catch (err) {
    console.error('API keys fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

// POST /api-keys
router.post('/api-keys', authMiddleware, async (req, res) => {
  try {
    const { name, scope } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Key name is required' });
    }
    if (name.trim().length > 64) {
      return res.status(400).json({ error: 'Key name must be 64 characters or less' });
    }
    const resolvedScope = ['full', 'deploy', 'read'].includes(scope) ? scope : 'full';

    const existing = await prisma.apiKey.count({ where: { userId: req.user.id } });
    if (existing >= 10) {
      return res.status(400).json({ error: 'Maximum of 10 API keys allowed per account' });
    }

    const rawKey = 'dplr_' + crypto.randomBytes(32).toString('hex');
    const prefix = rawKey.slice(0, 12); // "dplr_" + 7 chars
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const key = await prisma.apiKey.create({
      data: {
        userId: req.user.id,
        name: name.trim(),
        prefix,
        keyHash,
        scope: resolvedScope,
      },
    });

    // Return the full key only once — never stored, cannot be recovered
    res.status(201).json({
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      scope: key.scope,
      createdAt: key.createdAt,
      key: rawKey,
    });
  } catch (err) {
    console.error('API key create error:', err);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// DELETE /api-keys/:id
router.delete('/api-keys/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await prisma.apiKey.deleteMany({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (deleted.count === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('API key delete error:', err);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

module.exports = router;