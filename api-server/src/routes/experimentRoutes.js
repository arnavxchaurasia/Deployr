const express = require('express');
const { z } = require('zod');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireProjectAccess } = require('../services/projectAccessService');

const router = express.Router();

const variantSchema = z.object({
  key: z.string().min(1).max(50),
  weight: z.number().int().min(1).max(100),
  pathOverride: z.string().max(500).optional().nullable(),
});

router.get('/project/:id/experiments', authMiddleware, async (req, res) => {
  const access = await requireProjectAccess(req.user.id, req.params.id, 'MEMBER');
  if (!access) return res.status(403).json({ error: 'Forbidden' });

  const experiments = await prisma.experiment.findMany({
    where: { projectId: req.params.id },
    orderBy: { createdAt: 'asc' },
  });
  res.json(experiments);
});

router.post('/project/:id/experiments', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const schema = z.object({
      key: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/),
      variants: z.array(variantSchema).min(2).max(10),
      goalPath: z.string().max(500).optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const experiment = await prisma.experiment.create({
      data: {
        projectId: req.params.id,
        key: parsed.data.key,
        variants: parsed.data.variants,
        goalPath: parsed.data.goalPath || null,
      },
    });
    res.json(experiment);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'An experiment with this key already exists' });
    console.error('Create experiment error:', err);
    res.status(500).json({ error: 'Failed to create experiment' });
  }
});

router.patch('/project/:id/experiments/:experimentId', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const schema = z.object({
      enabled: z.boolean().optional(),
      variants: z.array(variantSchema).min(2).max(10).optional(),
      goalPath: z.string().max(500).optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const updated = await prisma.experiment.updateMany({
      where: { id: req.params.experimentId, projectId: req.params.id },
      data: parsed.data,
    });
    if (updated.count === 0) return res.status(404).json({ error: 'Not found' });

    res.json({ success: true });
  } catch (err) {
    console.error('Update experiment error:', err);
    res.status(500).json({ error: 'Failed to update experiment' });
  }
});

router.delete('/project/:id/experiments/:experimentId', authMiddleware, async (req, res) => {
  const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
  if (!access) return res.status(403).json({ error: 'Forbidden' });

  await prisma.experiment.deleteMany({ where: { id: req.params.experimentId, projectId: req.params.id } });
  res.json({ success: true });
});

// GET /project/:id/experiments/:experimentId/results — exposure/conversion
// counts per variant. Conversion rate is conversions/exposures for each
// variant — a directional signal, not a statistical-significance test.
router.get('/project/:id/experiments/:experimentId/results', authMiddleware, async (req, res) => {
  const access = await requireProjectAccess(req.user.id, req.params.id, 'MEMBER');
  if (!access) return res.status(403).json({ error: 'Forbidden' });

  const experiment = await prisma.experiment.findFirst({
    where: { id: req.params.experimentId, projectId: req.params.id },
  });
  if (!experiment) return res.status(404).json({ error: 'Not found' });

  const events = await prisma.experimentEvent.groupBy({
    by: ['variant', 'type'],
    where: { experimentId: experiment.id },
    _count: { _all: true },
  });

  const variants = (experiment.variants || []).map((v) => {
    const exposures = events.find((e) => e.variant === v.key && e.type === 'exposure')?._count._all ?? 0;
    const conversions = events.find((e) => e.variant === v.key && e.type === 'conversion')?._count._all ?? 0;
    return {
      key: v.key,
      exposures,
      conversions,
      conversionRate: exposures > 0 ? Math.round((conversions / exposures) * 1000) / 10 : null,
    };
  });

  res.json({ experiment: { id: experiment.id, key: experiment.key, goalPath: experiment.goalPath }, variants });
});

// POST /experiments/:experimentId/event — public, called fire-and-forget by
// the Cloudflare worker on exposure/conversion. No auth: same trust model as
// the /collect analytics beacon.
router.post('/experiments/:experimentId/event', async (req, res) => {
  try {
    const schema = z.object({ variant: z.string().max(50), type: z.enum(['exposure', 'conversion']) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.sendStatus(400);

    await prisma.experimentEvent.create({
      data: { experimentId: req.params.experimentId, variant: parsed.data.variant, type: parsed.data.type },
    });
    res.sendStatus(204);
  } catch {
    res.sendStatus(500);
  }
});

module.exports = router;
