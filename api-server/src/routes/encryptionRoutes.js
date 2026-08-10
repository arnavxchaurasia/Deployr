'use strict';

const express = require('express');
const crypto = require('crypto');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireProjectAccess } = require('../services/projectAccessService');

const router = express.Router();

// GET /project/:id/encryption — return KMS status and encrypted var count
router.get('/project/:id/encryption', authMiddleware, async (req, res) => {
  try {
    const projectId = req.params.id;
    const access = await requireProjectAccess(req.user.id, projectId, 'MEMBER');
    if (!access) return res.status(404).json({ error: 'Not found' });

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { kmsEnabled: true, kmsKeyId: true },
    });
    if (!project) return res.status(404).json({ error: 'Not found' });

    const encryptedVarCount = await prisma.environmentVariable.count({ where: { projectId } });

    res.json({
      kmsEnabled: project.kmsEnabled ?? false,
      kmsKeyId: project.kmsKeyId ?? null,
      encryptedVarCount,
    });
  } catch (err) {
    console.error('Encryption GET error:', err);
    res.status(500).json({ error: 'Failed to fetch encryption status' });
  }
});

// POST /project/:id/encryption/rotate — simulate KMS key rotation
router.post('/project/:id/encryption/rotate', authMiddleware, async (req, res) => {
  try {
    const projectId = req.params.id;
    const access = await requireProjectAccess(req.user.id, projectId, 'ADMIN');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const newKeyId = crypto.randomUUID();

    await prisma.project.update({
      where: { id: projectId },
      data: { kmsKeyId: newKeyId, kmsEnabled: true },
    });

    res.json({ rotated: true, newKeyId });
  } catch (err) {
    console.error('Encryption rotate error:', err);
    res.status(500).json({ error: 'Failed to rotate KMS key' });
  }
});

module.exports = router;
