const express = require('express');
const { z } = require('zod');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireProjectAccess } = require('../services/projectAccessService');

const router = express.Router();

const createSchema = z.object({
  name: z.string().min(1),
  route: z.string().min(1),
  code: z.string().max(50000),
  runtime: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  route: z.string().min(1).optional(),
  code: z.string().max(50000).optional(),
  enabled: z.boolean().optional(),
  runtime: z.string().optional(),
});

router.get('/project/:id/edge-functions', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'MEMBER');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const functions = await prisma.edgeFunction.findMany({
      where: { projectId: req.params.id },
      select: { id: true, name: true, route: true, runtime: true, enabled: true, lastDeployedAt: true, createdAt: true },
    });
    res.json(functions);
  } catch (e) {
    res.status(500).json({ error: 'Failed to list edge functions' });
  }
});

router.post('/project/:id/edge-functions', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const fn = await prisma.edgeFunction.create({
      data: { ...parsed.data, projectId: req.params.id, lastDeployedAt: new Date() },
    });
    res.status(201).json(fn);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create edge function' });
  }
});

router.get('/project/:id/edge-functions/:fnId', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'MEMBER');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const fn = await prisma.edgeFunction.findFirst({
      where: { id: req.params.fnId, projectId: req.params.id },
    });
    if (!fn) return res.status(404).json({ error: 'Not found' });
    res.json(fn);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get edge function' });
  }
});

router.put('/project/:id/edge-functions/:fnId', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await prisma.edgeFunction.findFirst({
      where: { id: req.params.fnId, projectId: req.params.id },
    });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const data = { ...parsed.data };
    if (parsed.data.code !== undefined) data.lastDeployedAt = new Date();

    const fn = await prisma.edgeFunction.update({ where: { id: req.params.fnId }, data });
    res.json(fn);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update edge function' });
  }
});

router.delete('/project/:id/edge-functions/:fnId', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const existing = await prisma.edgeFunction.findFirst({
      where: { id: req.params.fnId, projectId: req.params.id },
    });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    await prisma.edgeFunction.delete({ where: { id: req.params.fnId } });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete edge function' });
  }
});

module.exports = router;
