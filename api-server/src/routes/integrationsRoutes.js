const express = require('express');
const { z } = require('zod');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { projectAccessWhere } = require('../services/projectAccessService');
const { listConnectors, getConnector } = require('../services/integrationsService');

const router = express.Router();

// GET /integrations/connectors — the marketplace directory (no project
// context needed, same registry for everyone).
router.get('/integrations/connectors', authMiddleware, (_req, res) => {
  res.json(listConnectors());
});

// GET /project/:id/integrations — connector directory plus this project's
// current config, merged, for the marketplace UI to render enabled/disabled
// state alongside available connectors. Config values (API keys/DSNs) are
// returned as-is, same trust model as env var reveal — dashboard-only, ADMIN access.
router.get('/project/:id/integrations', authMiddleware, async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
    select: { integrations: true },
  });
  if (!project) return res.status(404).json({ error: 'Not found' });

  const configured = project.integrations || {};
  const connectors = listConnectors().map((c) => ({ ...c, config: configured[c.id] || null }));
  res.json(connectors);
});

// POST /project/:id/integrations/:connectorId — save/enable a connector's config.
router.post('/project/:id/integrations/:connectorId', authMiddleware, async (req, res) => {
  try {
    const connector = getConnector(req.params.connectorId);
    if (!connector) return res.status(404).json({ error: 'Unknown connector' });

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
      select: { id: true, integrations: true },
    });
    if (!project) return res.status(404).json({ error: 'Not found' });

    const fieldSchema = {};
    for (const f of connector.fields) fieldSchema[f.key] = z.string().max(2000);
    const schema = z.object({ enabled: z.boolean(), ...fieldSchema });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const integrations = { ...(project.integrations || {}) };
    integrations[connector.id] = parsed.data;

    await prisma.project.update({ where: { id: project.id }, data: { integrations } });
    res.json({ success: true });
  } catch (err) {
    console.error('Save integration error:', err);
    res.status(500).json({ error: 'Failed to save integration' });
  }
});

router.delete('/project/:id/integrations/:connectorId', authMiddleware, async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
    select: { id: true, integrations: true },
  });
  if (!project) return res.status(404).json({ error: 'Not found' });

  const integrations = { ...(project.integrations || {}) };
  delete integrations[req.params.connectorId];

  await prisma.project.update({ where: { id: project.id }, data: { integrations } });
  res.json({ success: true });
});

module.exports = router;
