'use strict';

const express = require('express');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireProjectAccess } = require('../services/projectAccessService');
const { scanEnvVars } = require('../services/secretScanService');

const router = express.Router();

// GET /project/:id/secret-scans — list last 50 scan results, newest first (MEMBER)
router.get('/project/:id/secret-scans', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'MEMBER');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const results = await prisma.secretScanResult.findMany({
      where: { projectId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json(results);
  } catch (err) {
    console.error('List secret scans error:', err);
    res.status(500).json({ error: 'Failed to list secret scan results' });
  }
});

// POST /project/:id/secret-scans/scan-env — scan env var keys (ADMIN)
router.post('/project/:id/secret-scans/scan-env', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const envVars = await prisma.environmentVariable.findMany({
      where: { projectId: req.params.id },
      select: { key: true },
    });

    // Build a key→'' map — we only scan keys, not encrypted values
    const keyMap = Object.fromEntries(envVars.map((e) => [e.key, '']));
    const hits = scanEnvVars(keyMap);

    const saved = await Promise.all(
      hits.map((hit) =>
        prisma.secretScanResult.create({
          data: {
            projectId: req.params.id,
            severity: hit.severity,
            ruleId: hit.ruleId,
            redacted: hit.redacted,
            location: hit.location,
            blocked: false,
          },
        })
      )
    );

    res.json({ found: saved.length, results: saved });
  } catch (err) {
    console.error('Scan env error:', err);
    res.status(500).json({ error: 'Failed to scan environment variables' });
  }
});

// POST /project/:id/secret-scans/:scanId/resolve — mark resolved (ADMIN)
router.post('/project/:id/secret-scans/:scanId/resolve', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const result = await prisma.secretScanResult.findFirst({
      where: { id: req.params.scanId, projectId: req.params.id },
    });
    if (!result) return res.status(404).json({ error: 'Scan result not found' });

    const updated = await prisma.secretScanResult.update({
      where: { id: req.params.scanId },
      data: { resolvedAt: new Date() },
    });

    res.json(updated);
  } catch (err) {
    console.error('Resolve secret scan error:', err);
    res.status(500).json({ error: 'Failed to resolve scan result' });
  }
});

module.exports = router;
