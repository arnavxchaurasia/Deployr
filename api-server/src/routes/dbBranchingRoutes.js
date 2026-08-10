'use strict';

const express = require('express');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { projectAccessWhere } = require('../services/projectAccessService');

const router = express.Router();

// ── GET /project/:id/db-branching (MEMBER) ────────────────────────────────────
// Returns the current DB-branching configuration and a count of active preview
// deployments so the UI can surface how many live branches are running.
router.get('/project/:id/db-branching', authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'MEMBER') },
    });
    if (!project) return res.status(404).json({ error: 'Not found' });

    const activeDeploymentCount = await prisma.deployment.count({
      where: { projectId: project.id, isPreview: true, status: 'READY' },
    });

    return res.json({
      enabled: project.dbBranchingEnabled,
      webhookConfigured: !!project.previewDbProvisionWebhookUrl,
      activeDeploymentCount,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /project/:id/db-branching (ADMIN) ───────────────────────────────────
// Toggle the DB-branching feature flag for this project.
router.patch('/project/:id/db-branching', authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
    });
    if (!project) return res.status(404).json({ error: 'Not found' });

    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '`enabled` must be a boolean' });
    }

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { dbBranchingEnabled: enabled },
    });

    return res.json({
      enabled: updated.dbBranchingEnabled,
      webhookConfigured: !!updated.previewDbProvisionWebhookUrl,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
