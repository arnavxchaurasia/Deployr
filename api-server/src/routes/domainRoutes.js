const express = require('express');
const crypto = require('crypto');
const dns = require('dns').promises;
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { projectAccessWhere } = require('../services/projectAccessService');

const router = express.Router();

const domainSelect = {
  id: true, name: true, slug: true,
  customDomain: true, domainVerified: true,
  domainVerificationToken: true, sslStatus: true,
};

function formatDomain(p) {
  return {
    projectId: p.id,
    projectName: p.name,
    projectSlug: p.slug,
    domain: p.customDomain,
    verified: p.domainVerified,
    sslStatus: p.sslStatus,
    verificationToken: p.domainVerificationToken,
  };
}

// GET /domains — list all user's projects that have a customDomain set
router.get('/domains', authMiddleware, async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: { ...projectAccessWhere(req.user.id, 'MEMBER'), customDomain: { not: null } },
      select: domainSelect,
    });
    res.json(projects.map(formatDomain));
  } catch (err) {
    console.error('List domains error:', err);
    res.status(500).json({ error: 'Failed to list domains' });
  }
});

// GET /project/:id/domain
router.get('/project/:id/domain', authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'MEMBER') },
      select: domainSelect,
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(formatDomain(project));
  } catch (err) {
    console.error('Get domain error:', err);
    res.status(500).json({ error: 'Failed to get domain' });
  }
});

// POST /project/:id/domain — set/update custom domain (ADMIN)
router.post('/project/:id/domain', authMiddleware, async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({ error: 'domain is required' });
    }
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
      select: { id: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found or insufficient permissions' });

    const token = crypto.randomBytes(12).toString('hex');
    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { customDomain: domain, domainVerified: false, domainVerificationToken: token, sslStatus: 'pending' },
      select: domainSelect,
    });
    res.json(formatDomain(updated));
  } catch (err) {
    console.error('Set domain error:', err);
    res.status(500).json({ error: 'Failed to set domain' });
  }
});

// DELETE /project/:id/domain (ADMIN)
router.delete('/project/:id/domain', authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
      select: { id: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found or insufficient permissions' });

    await prisma.project.update({
      where: { id: project.id },
      data: { customDomain: null, domainVerified: false, domainVerificationToken: null, sslStatus: 'none' },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete domain error:', err);
    res.status(500).json({ error: 'Failed to remove domain' });
  }
});

// POST /project/:id/domain/verify (ADMIN)
router.post('/project/:id/domain/verify', authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'ADMIN') },
      select: { id: true, customDomain: true, domainVerificationToken: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found or insufficient permissions' });
    if (!project.customDomain || !project.domainVerificationToken) {
      return res.status(400).json({ error: 'No domain configured for this project' });
    }

    let verified = false;
    try {
      const records = await dns.resolveTxt(`_deployr-verify.${project.customDomain}`);
      verified = records.some(r => r.join('') === project.domainVerificationToken);
    } catch {
      // DNS lookup failed — treat as unverified
    }

    if (verified) {
      await prisma.project.update({
        where: { id: project.id },
        data: { domainVerified: true, sslStatus: 'active' },
      });
    }

    res.json({
      verified,
      message: verified
        ? 'Domain verified and SSL activated.'
        : `Add a TXT record _deployr-verify.${project.customDomain} with value ${project.domainVerificationToken} and retry.`,
    });
  } catch (err) {
    console.error('Verify domain error:', err);
    res.status(500).json({ error: 'Failed to verify domain' });
  }
});

module.exports = router;
