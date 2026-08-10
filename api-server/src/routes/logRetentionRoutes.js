const express = require('express');
const { z } = require('zod');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireProjectAccess } = require('../services/projectAccessService');

const router = express.Router();

const updateSchema = z.object({
  retentionDays: z.number().int().min(1).max(365).optional(),
  archiveEnabled: z.boolean().optional(),
  archiveBucket: z.string().optional(),
  archiveRegion: z.string().optional(),
});

router.get('/project/:id/log-retention', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'MEMBER');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const policy = await prisma.logRetentionPolicy.upsert({
      where: { projectId: req.params.id },
      update: {},
      create: { projectId: req.params.id },
    });
    res.json(policy);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get log retention policy' });
  }
});

router.put('/project/:id/log-retention', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const policy = await prisma.logRetentionPolicy.upsert({
      where: { projectId: req.params.id },
      update: parsed.data,
      create: { projectId: req.params.id, ...parsed.data },
    });
    res.json(policy);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update log retention policy' });
  }
});

module.exports = router;
