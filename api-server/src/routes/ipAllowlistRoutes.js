const express = require('express');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { projectAccessWhere } = require('../services/projectAccessService');

const router = express.Router();

const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$|^[0-9a-fA-F:]+\/\d{1,3}$/;

// GET /project/:id/ip-allowlist (MEMBER)
router.get('/project/:id/ip-allowlist', authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'MEMBER') },
      select: { id: true, ipAllowlistEnabled: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const entries = await prisma.ipAllowlistEntry.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ enabled: project.ipAllowlistEnabled, entries });
  } catch (err) {
    console.error('Get IP allowlist error:', err);
    res.status(500).json({ error: 'Failed to get IP allowlist' });
  }
});

// POST /project/:id/ip-allowlist/entries (ADMIN)
router.post('/project/:id/ip-allowlist/entries', authMiddleware, async (req, res) => {
  try {
    const { cidr, description } = req.body;
    if (!cidr || !CIDR_RE.test(cidr)) {
      return res.status(400).json({ error: 'Invalid CIDR format' });
    }

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
      select: { id: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found or insufficient permissions' });

    const entry = await prisma.ipAllowlistEntry.create({
      data: { projectId: project.id, cidr, description: description || null, enabled: true },
    });
    res.status(201).json(entry);
  } catch (err) {
    console.error('Add IP allowlist entry error:', err);
    res.status(500).json({ error: 'Failed to add IP allowlist entry' });
  }
});

// DELETE /project/:id/ip-allowlist/entries/:entryId (ADMIN)
router.delete('/project/:id/ip-allowlist/entries/:entryId', authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
      select: { id: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found or insufficient permissions' });

    const entry = await prisma.ipAllowlistEntry.findFirst({
      where: { id: req.params.entryId, projectId: project.id },
    });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    await prisma.ipAllowlistEntry.delete({ where: { id: entry.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete IP allowlist entry error:', err);
    res.status(500).json({ error: 'Failed to delete IP allowlist entry' });
  }
});

// PATCH /project/:id/ip-allowlist — toggle enabled (ADMIN)
router.patch('/project/:id/ip-allowlist', authMiddleware, async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
      select: { id: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found or insufficient permissions' });

    await prisma.project.update({ where: { id: project.id }, data: { ipAllowlistEnabled: enabled } });
    res.json({ enabled });
  } catch (err) {
    console.error('Toggle IP allowlist error:', err);
    res.status(500).json({ error: 'Failed to update IP allowlist' });
  }
});

module.exports = router;
