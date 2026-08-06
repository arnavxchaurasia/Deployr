const express = require('express');
const { z } = require('zod');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireProjectAccess } = require('../services/projectAccessService');

const router = express.Router();

// GET /project/:id/members — every org member's effective role on this
// project (org role, or a per-project override if one is set), for the
// permission matrix UI. OWNER-only: this reveals who can do what, which is
// itself sensitive.
router.get('/project/:id/members', authMiddleware, async (req, res) => {
  const access = await requireProjectAccess(req.user.id, req.params.id, 'OWNER');
  if (!access) return res.status(403).json({ error: 'Forbidden' });

  const project = access.project;
  if (!project.orgId) return res.json({ members: [], orgOwned: false });

  const [memberships, overrides] = await Promise.all([
    prisma.organizationMembership.findMany({
      where: { orgId: project.orgId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.projectMemberOverride.findMany({ where: { projectId: project.id } }),
  ]);

  const overrideByUserId = new Map(overrides.map((o) => [o.userId, o.role]));

  const members = memberships.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    orgRole: m.role,
    override: overrideByUserId.get(m.userId) ?? null,
    effectiveRole: overrideByUserId.get(m.userId) ?? m.role,
    isCreator: m.userId === project.userId,
  }));

  res.json({ members, orgOwned: true });
});

// POST /project/:id/members/:userId/override — set (or replace) a
// per-project role override for an org member. Cannot target the project's
// own creator, who is always OWNER regardless.
router.post('/project/:id/members/:userId/override', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'OWNER');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    if (req.params.userId === access.project.userId) {
      return res.status(400).json({ error: "Can't override the project creator's role" });
    }

    const schema = z.object({ role: z.enum(['MEMBER', 'ADMIN', 'OWNER']) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    if (!access.project.orgId) {
      return res.status(400).json({ error: 'This project has no org to grant overrides within' });
    }

    const membership = await prisma.organizationMembership.findUnique({
      where: { orgId_userId: { orgId: access.project.orgId, userId: req.params.userId } },
    });
    if (!membership) return res.status(404).json({ error: 'Not a member of this project\'s org' });

    const override = await prisma.projectMemberOverride.upsert({
      where: { projectId_userId: { projectId: req.params.id, userId: req.params.userId } },
      update: { role: parsed.data.role },
      create: { projectId: req.params.id, userId: req.params.userId, role: parsed.data.role },
    });

    res.json(override);
  } catch (err) {
    console.error('Set project member override error:', err);
    res.status(500).json({ error: 'Failed to set override' });
  }
});

router.delete('/project/:id/members/:userId/override', authMiddleware, async (req, res) => {
  const access = await requireProjectAccess(req.user.id, req.params.id, 'OWNER');
  if (!access) return res.status(403).json({ error: 'Forbidden' });

  await prisma.projectMemberOverride.deleteMany({
    where: { projectId: req.params.id, userId: req.params.userId },
  });

  res.json({ success: true });
});

module.exports = router;
