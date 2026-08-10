const express = require('express');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

// GET /deployments/diff?a=<id>&b=<id>
router.get('/deployments/diff', authMiddleware, async (req, res) => {
  const { a: aId, b: bId } = req.query;
  if (!aId || !bId) return res.status(400).json({ error: 'Query params a and b are required' });
  if (aId === bId) return res.status(400).json({ error: 'a and b must be different deployments' });

  try {
    const [depA, depB] = await Promise.all([
      prisma.deployment.findUnique({ where: { id: aId }, include: { project: true } }),
      prisma.deployment.findUnique({ where: { id: bId }, include: { project: true } }),
    ]);

    if (!depA || depA.project.userId !== req.user.id)
      return res.status(404).json({ error: 'Deployment a not found or access denied' });
    if (!depB || depB.project.userId !== req.user.id)
      return res.status(404).json({ error: 'Deployment b not found or access denied' });

    const buildMs = (dep) => {
      if (!dep.startedAt || !dep.finishedAt) return null;
      return new Date(dep.finishedAt).getTime() - new Date(dep.startedAt).getTime();
    };

    const msA = buildMs(depA);
    const msB = buildMs(depB);
    const buildTimeDeltaMs = msA !== null && msB !== null ? msB - msA : null;

    const pick = (dep) => ({
      id: dep.id,
      commitHash: dep.commitHash,
      branch: dep.branch,
      createdAt: dep.createdAt,
      buildCacheHit: dep.buildCacheHit,
      status: dep.status,
    });

    return res.json({
      a: pick(depA),
      b: pick(depB),
      diff: {
        branchChanged: depA.branch !== depB.branch,
        commitChanged: depA.commitHash !== depB.commitHash,
        buildTimeDeltaMs,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
