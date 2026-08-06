const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { projectAccessWhere } = require('../services/projectAccessService');

const router = express.Router();

// Deterministic bucketing so the same visitor gets a stable answer for a
// given flag across requests (no cookie/session needed) — hash(flagId+userId)
// mod 100, compared against rolloutPercent. Falls back to random-per-request
// bucketing when no userId is supplied (the caller accepted that tradeoff by
// not passing one).
function isInRollout(flagId, userId, rolloutPercent) {
  if (rolloutPercent >= 100) return true;
  if (rolloutPercent <= 0) return false;
  if (!userId) return Math.random() * 100 < rolloutPercent;

  const hash = crypto.createHash('sha256').update(`${flagId}:${userId}`).digest();
  const bucket = hash.readUInt32BE(0) % 100;
  return bucket < rolloutPercent;
}

// ── GET /project/:id/flags — dashboard list ───────────────────────────────────
router.get('/project/:id/flags', authMiddleware, async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'MEMBER') },
  });
  if (!project) return res.status(404).json({ error: 'Not found' });

  const flags = await prisma.featureFlag.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: 'asc' },
  });
  res.json(flags);
});

// ── POST /project/:id/flags — create or update (upsert by key) ───────────────
router.post('/project/:id/flags', authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
    });
    if (!project) return res.status(404).json({ error: 'Not found' });

    const schema = z.object({
      key: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.-]+$/, 'Alphanumeric, dot, dash, underscore only'),
      enabled: z.boolean().optional(),
      rolloutPercent: z.number().int().min(0).max(100).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const flag = await prisma.featureFlag.upsert({
      where: { projectId_key: { projectId: project.id, key: parsed.data.key } },
      update: {
        enabled: parsed.data.enabled ?? undefined,
        rolloutPercent: parsed.data.rolloutPercent ?? undefined,
      },
      create: {
        projectId: project.id,
        key: parsed.data.key,
        enabled: parsed.data.enabled ?? false,
        rolloutPercent: parsed.data.rolloutPercent ?? 100,
      },
    });

    res.json(flag);
  } catch (err) {
    console.error('Save feature flag error:', err);
    res.status(500).json({ error: 'Failed to save feature flag' });
  }
});

router.delete('/project/:id/flags/:flagId', authMiddleware, async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
  });
  if (!project) return res.status(404).json({ error: 'Not found' });

  await prisma.featureFlag.deleteMany({ where: { id: req.params.flagId, projectId: project.id } });
  res.json({ success: true });
});

// ── GET /flags/:projectId — public evaluation endpoint, called from a
// deployed app's own frontend/backend at runtime (no auth: same trust model
// as a public API key, this is meant to be embedded in client code). Optional
// ?userId= for stable per-user bucketing.
router.get('/flags/:projectId', async (req, res) => {
  try {
    const flags = await prisma.featureFlag.findMany({ where: { projectId: req.params.projectId } });
    const userId = typeof req.query.userId === 'string' ? req.query.userId : null;

    const result = {};
    for (const flag of flags) {
      result[flag.key] = flag.enabled && isInRollout(flag.id, userId, flag.rolloutPercent);
    }
    res.json(result);
  } catch (err) {
    console.error('Flag evaluation error:', err);
    res.status(500).json({ error: 'Failed to evaluate flags' });
  }
});

module.exports = router;
