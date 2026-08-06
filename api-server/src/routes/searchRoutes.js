'use strict';

const express = require('express');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { projectAccessWhere } = require('../services/projectAccessService');

const router = express.Router();

// GET /search?q=... — projects, deployments, and recent log lines the user
// can access. Bounded on every axis (query length, result counts, log
// lookback window) since this fans out across a potentially large amount
// of data — a global search box shouldn't be a way to accidentally run an
// expensive unbounded scan.
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    if (q.length < 2) {
      return res.json({ projects: [], deployments: [], logs: [] });
    }

    const accessibleProjects = await prisma.project.findMany({
      where: projectAccessWhere(req.user.id, 'MEMBER'),
      select: { id: true, name: true, slug: true },
      take: 500,
    });
    const projectIds = accessibleProjects.map((p) => p.id);
    const projectById = new Map(accessibleProjects.map((p) => [p.id, p]));

    const matchingProjects = accessibleProjects
      .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.slug.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 10);

    if (projectIds.length === 0) {
      return res.json({ projects: matchingProjects, deployments: [], logs: [] });
    }

    const deployments = await prisma.deployment.findMany({
      where: {
        projectId: { in: projectIds },
        OR: [
          { branch: { contains: q, mode: 'insensitive' } },
          { commitHash: { contains: q, mode: 'insensitive' } },
          { id: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, projectId: true, branch: true, commitHash: true, status: true, createdAt: true },
      take: 10,
    });

    // Log search is the expensive one — scope to a recent window of
    // deployments in accessible projects, not every log line ever recorded.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentDeployments = await prisma.deployment.findMany({
      where: { projectId: { in: projectIds }, createdAt: { gte: since } },
      select: { id: true, projectId: true },
      take: 500,
    });
    const deploymentProjectMap = new Map(recentDeployments.map((d) => [d.id, d.projectId]));

    const logs = recentDeployments.length
      ? await prisma.logEvent.findMany({
          where: {
            deploymentId: { in: recentDeployments.map((d) => d.id) },
            log: { contains: q, mode: 'insensitive' },
          },
          orderBy: { timestamp: 'desc' },
          select: { deploymentId: true, log: true, timestamp: true },
          take: 10,
        })
      : [];

    res.json({
      projects: matchingProjects,
      deployments: deployments.map((d) => ({ ...d, projectName: projectById.get(d.projectId)?.name })),
      logs: logs.map((l) => ({
        ...l,
        projectId: deploymentProjectMap.get(l.deploymentId),
        projectName: projectById.get(deploymentProjectMap.get(l.deploymentId))?.name,
      })),
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
