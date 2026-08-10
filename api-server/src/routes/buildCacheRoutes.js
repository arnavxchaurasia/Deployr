'use strict';

const express = require('express');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireProjectAccess } = require('../services/projectAccessService');
const { getCacheStats } = require('../services/buildCacheService');

const router = express.Router();

// GET /project/:id/build-cache — return cache stats (MEMBER)
router.get('/project/:id/build-cache', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'MEMBER');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const stats = await getCacheStats(req.params.id);
    res.json(stats);
  } catch (err) {
    console.error('Get build cache stats error:', err);
    res.status(500).json({ error: 'Failed to get build cache stats' });
  }
});

// DELETE /project/:id/build-cache — force-invalidate all cache entries (ADMIN)
router.delete('/project/:id/build-cache', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const { count } = await prisma.buildCache.deleteMany({
      where: { projectId: req.params.id },
    });

    res.json({ deleted: count });
  } catch (err) {
    console.error('Delete build cache error:', err);
    res.status(500).json({ error: 'Failed to invalidate build cache' });
  }
});

// DELETE /project/:id/build-cache/:cacheId — delete one entry (ADMIN)
router.delete('/project/:id/build-cache/:cacheId', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const entry = await prisma.buildCache.findFirst({
      where: { id: req.params.cacheId, projectId: req.params.id },
    });
    if (!entry) return res.status(404).json({ error: 'Cache entry not found' });

    await prisma.buildCache.delete({ where: { id: req.params.cacheId } });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete cache entry error:', err);
    res.status(500).json({ error: 'Failed to delete cache entry' });
  }
});

module.exports = router;
