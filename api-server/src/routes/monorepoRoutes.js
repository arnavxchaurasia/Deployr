'use strict';

const express = require('express');
const { z } = require('zod');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireProjectAccess } = require('../services/projectAccessService');

const router = express.Router();

// GET /project/:id/monorepo — return current monorepo config (MEMBER)
router.get('/project/:id/monorepo', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'MEMBER');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const { monorepoRoot } = access.project;
    res.json({ monorepoRoot: monorepoRoot || null, detected: monorepoRoot != null });
  } catch (err) {
    console.error('Get monorepo error:', err);
    res.status(500).json({ error: 'Failed to get monorepo config' });
  }
});

// POST /project/:id/monorepo/detect — simulate workspace detection + optional root set (ADMIN)
router.post('/project/:id/monorepo/detect', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const candidates = ['apps/web', 'apps/api', 'packages/ui', 'services/worker'];

    const schema = z.object({ root: z.string().min(1).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    let monorepoRoot = access.project.monorepoRoot || null;
    if (parsed.data.root) {
      await prisma.project.update({
        where: { id: req.params.id },
        data: { monorepoRoot: parsed.data.root },
      });
      monorepoRoot = parsed.data.root;
    }

    res.json({ candidates, monorepoRoot });
  } catch (err) {
    console.error('Detect monorepo error:', err);
    res.status(500).json({ error: 'Failed to run monorepo detection' });
  }
});

// PATCH /project/:id/monorepo — update monorepoRoot (ADMIN)
router.patch('/project/:id/monorepo', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const schema = z.object({ monorepoRoot: z.string().min(1).nullable() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const updated = await prisma.project.update({
      where: { id: req.params.id },
      data: { monorepoRoot: parsed.data.monorepoRoot },
      select: { id: true, monorepoRoot: true },
    });

    res.json({ monorepoRoot: updated.monorepoRoot, detected: updated.monorepoRoot != null });
  } catch (err) {
    console.error('Update monorepo error:', err);
    res.status(500).json({ error: 'Failed to update monorepo config' });
  }
});

module.exports = router;
