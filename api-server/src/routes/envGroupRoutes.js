const express = require('express');
const { z } = require('zod');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { encrypt } = require('../../lib/crypto');
const { requireProjectAccess } = require('../services/projectAccessService');

const router = express.Router();

async function requireOrgRole(orgId, userId, ...roles) {
  const membership = await prisma.organizationMembership.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  if (!membership || !roles.includes(membership.role)) return null;
  return membership;
}

// ── GET /orgs/:id/env-groups — list groups + variable KEYS (masked values,
// same convention as GET /project/:id/env) ───────────────────────────────────
router.get('/orgs/:id/env-groups', authMiddleware, async (req, res) => {
  const membership = await requireOrgRole(req.params.id, req.user.id, 'OWNER', 'ADMIN', 'MEMBER');
  if (!membership) return res.status(403).json({ error: 'Forbidden' });

  const groups = await prisma.envGroup.findMany({
    where: { orgId: req.params.id },
    include: { variables: { select: { id: true, key: true, updatedAt: true } }, _count: { select: { projects: true } } },
    orderBy: { createdAt: 'asc' },
  });

  res.json(groups.map((g) => ({
    id: g.id,
    name: g.name,
    variables: g.variables,
    attachedProjectCount: g._count.projects,
    createdAt: g.createdAt,
  })));
});

router.post('/orgs/:id/env-groups', authMiddleware, async (req, res) => {
  try {
    const membership = await requireOrgRole(req.params.id, req.user.id, 'OWNER', 'ADMIN');
    if (!membership) return res.status(403).json({ error: 'Forbidden' });

    const schema = z.object({ name: z.string().min(1).max(80) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const group = await prisma.envGroup.create({ data: { orgId: req.params.id, name: parsed.data.name } });
    res.json(group);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A group with this name already exists' });
    console.error('Create env group error:', err);
    res.status(500).json({ error: 'Failed to create env group' });
  }
});

router.delete('/orgs/:id/env-groups/:groupId', authMiddleware, async (req, res) => {
  const membership = await requireOrgRole(req.params.id, req.user.id, 'OWNER', 'ADMIN');
  if (!membership) return res.status(403).json({ error: 'Forbidden' });

  await prisma.envGroup.deleteMany({ where: { id: req.params.groupId, orgId: req.params.id } });
  res.json({ success: true });
});

router.post('/orgs/:id/env-groups/:groupId/variables', authMiddleware, async (req, res) => {
  try {
    const membership = await requireOrgRole(req.params.id, req.user.id, 'OWNER', 'ADMIN');
    if (!membership) return res.status(403).json({ error: 'Forbidden' });

    const group = await prisma.envGroup.findFirst({ where: { id: req.params.groupId, orgId: req.params.id } });
    if (!group) return res.status(404).json({ error: 'Not found' });

    const schema = z.object({ key: z.string().min(1).max(200), value: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const variable = await prisma.envGroupVariable.upsert({
      where: { groupId_key: { groupId: group.id, key: parsed.data.key } },
      update: { value: encrypt(parsed.data.value) },
      create: { groupId: group.id, key: parsed.data.key, value: encrypt(parsed.data.value) },
    });

    res.json({ id: variable.id, key: variable.key, updatedAt: variable.updatedAt });
  } catch (err) {
    console.error('Save env group variable error:', err);
    res.status(500).json({ error: 'Failed to save variable' });
  }
});

router.delete('/orgs/:id/env-groups/:groupId/variables/:key', authMiddleware, async (req, res) => {
  const membership = await requireOrgRole(req.params.id, req.user.id, 'OWNER', 'ADMIN');
  if (!membership) return res.status(403).json({ error: 'Forbidden' });

  await prisma.envGroupVariable.deleteMany({
    where: { groupId: req.params.groupId, key: req.params.key, group: { orgId: req.params.id } },
  });
  res.json({ success: true });
});

// ── Attach/detach a group to a project ────────────────────────────────────────

router.get('/project/:id/env-groups', authMiddleware, async (req, res) => {
  const access = await requireProjectAccess(req.user.id, req.params.id, 'MEMBER');
  if (!access) return res.status(403).json({ error: 'Forbidden' });

  const links = await prisma.projectEnvGroup.findMany({
    where: { projectId: req.params.id },
    include: { group: { select: { id: true, name: true } } },
  });
  res.json(links.map((l) => l.group));
});

router.post('/project/:id/env-groups/:groupId', authMiddleware, async (req, res) => {
  try {
    const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    if (!access.project.orgId) {
      return res.status(400).json({ error: 'This project has no org to attach a shared env group from' });
    }

    const group = await prisma.envGroup.findFirst({ where: { id: req.params.groupId, orgId: access.project.orgId } });
    if (!group) return res.status(404).json({ error: 'Env group not found in this project\'s org' });

    await prisma.projectEnvGroup.upsert({
      where: { projectId_groupId: { projectId: req.params.id, groupId: group.id } },
      update: {},
      create: { projectId: req.params.id, groupId: group.id },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Attach env group error:', err);
    res.status(500).json({ error: 'Failed to attach env group' });
  }
});

router.delete('/project/:id/env-groups/:groupId', authMiddleware, async (req, res) => {
  const access = await requireProjectAccess(req.user.id, req.params.id, 'ADMIN');
  if (!access) return res.status(403).json({ error: 'Forbidden' });

  await prisma.projectEnvGroup.deleteMany({ where: { projectId: req.params.id, groupId: req.params.groupId } });
  res.json({ success: true });
});

module.exports = router;
