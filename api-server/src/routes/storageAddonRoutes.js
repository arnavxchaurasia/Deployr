const express = require('express');
const { z } = require('zod');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { encrypt } = require('../../lib/crypto');
const { requireProjectAccess } = require('../services/projectAccessService');
const { provisionStorageAddon, destroyStorageAddon } = require('../services/storageAddonService');

const router = express.Router();

const ADDON_TYPES = ['postgres', 'redis', 'kv', 'blob'];

// GET /project/:id/storage-addons — connection strings are never returned,
// only whether one is set (same masking convention as GET /project/:id/env).
router.get('/project/:id/storage-addons', authMiddleware, async (req, res) => {
  const access = await requireProjectAccess(req.user.id, req.params.id, 'MEMBER');
  if (!access) return res.status(403).json({ error: 'Forbidden' });

  const addons = await prisma.storageAddon.findMany({
    where: { projectId: req.params.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, type: true, name: true, envVarKey: true, provisionWebhookUrl: true, status: true, createdAt: true },
  });
  res.json(addons.map((a) => ({ ...a, hasConnectionString: a.status === 'provisioned' })));
});

// POST /project/:id/storage-addons — either paste a connection string
// directly, or point at a provisioning webhook to have one created.
router.post('/project/:id/storage-addons', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const schema = z.object({
      type: z.enum(ADDON_TYPES),
      name: z.string().min(1).max(80),
      envVarKey: z.string().min(1).max(200).regex(/^[A-Z0-9_]+$/, 'Must be SCREAMING_SNAKE_CASE'),
      connectionString: z.string().min(1).optional(),
      provisionWebhookUrl: z.string().url().optional(),
    }).refine((d) => d.connectionString || d.provisionWebhookUrl, {
      message: 'Provide either a connectionString or a provisionWebhookUrl',
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const addon = await prisma.storageAddon.create({
      data: {
        projectId: req.params.id,
        type: parsed.data.type,
        name: parsed.data.name,
        envVarKey: parsed.data.envVarKey,
        provisionWebhookUrl: parsed.data.provisionWebhookUrl || null,
        connectionString: parsed.data.connectionString ? encrypt(parsed.data.connectionString) : null,
        status: parsed.data.connectionString ? 'provisioned' : 'pending',
      },
    });

    if (parsed.data.provisionWebhookUrl) {
      provisionStorageAddon(addon.id).catch(() => {});
    }

    res.json({ id: addon.id, type: addon.type, name: addon.name, envVarKey: addon.envVarKey, status: addon.status });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'That env var key is already used by another addon on this project' });
    console.error('Create storage addon error:', err);
    res.status(500).json({ error: 'Failed to create storage add-on' });
  }
});

router.delete('/project/:id/storage-addons/:addonId', authMiddleware, async (req, res) => {
  const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
  if (!access) return res.status(403).json({ error: 'Forbidden' });

  const addon = await prisma.storageAddon.findFirst({ where: { id: req.params.addonId, projectId: req.params.id } });
  if (!addon) return res.status(404).json({ error: 'Not found' });

  await destroyStorageAddon(addon).catch(() => {});
  await prisma.storageAddon.delete({ where: { id: addon.id } });

  res.json({ success: true });
});

module.exports = router;
