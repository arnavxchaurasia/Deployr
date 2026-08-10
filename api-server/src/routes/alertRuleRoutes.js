const express = require('express');
const { z } = require('zod');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireProjectAccess } = require('../services/projectAccessService');

const router = express.Router();

const METRICS = ['uptime', 'error_rate', 'build_failure', 'deploy_duration_ms'];

const createSchema = z.object({
  name: z.string().min(1),
  metric: z.enum(METRICS),
  threshold: z.number(),
  channels: z.array(z.any()).optional(),
  enabled: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  metric: z.enum(METRICS).optional(),
  threshold: z.number().optional(),
  channels: z.array(z.any()).optional(),
  enabled: z.boolean().optional(),
});

router.get('/project/:id/alert-rules', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'MEMBER');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const rules = await prisma.alertRule.findMany({ where: { projectId: req.params.id } });
    res.json(rules);
  } catch (e) {
    res.status(500).json({ error: 'Failed to list alert rules' });
  }
});

router.post('/project/:id/alert-rules', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const rule = await prisma.alertRule.create({
      data: {
        ...parsed.data,
        channels: parsed.data.channels ?? [],
        projectId: req.params.id,
      },
    });
    res.status(201).json(rule);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create alert rule' });
  }
});

router.put('/project/:id/alert-rules/:ruleId', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await prisma.alertRule.findFirst({
      where: { id: req.params.ruleId, projectId: req.params.id },
    });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const rule = await prisma.alertRule.update({ where: { id: req.params.ruleId }, data: parsed.data });
    res.json(rule);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update alert rule' });
  }
});

router.delete('/project/:id/alert-rules/:ruleId', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const existing = await prisma.alertRule.findFirst({
      where: { id: req.params.ruleId, projectId: req.params.id },
    });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    await prisma.alertRule.delete({ where: { id: req.params.ruleId } });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete alert rule' });
  }
});

router.post('/project/:id/alert-rules/:ruleId/test', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const existing = await prisma.alertRule.findFirst({
      where: { id: req.params.ruleId, projectId: req.params.id },
    });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const rule = await prisma.alertRule.update({
      where: { id: req.params.ruleId },
      data: { lastFiredAt: new Date() },
    });
    res.json({ fired: true, channels: rule.channels });
  } catch (e) {
    res.status(500).json({ error: 'Failed to test alert rule' });
  }
});

module.exports = router;
