const express = require('express');
const crypto = require('crypto');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { sendInvitationEmail } = require('../services/mailService');

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugifyName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

async function requireMembership(orgId, userId) {
  return prisma.organizationMembership.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
}

async function requireOrgRole(orgId, userId, ...roles) {
  const membership = await requireMembership(orgId, userId);
  if (!membership || !roles.includes(membership.role)) return null;
  return membership;
}

// ── POST /orgs — Create organization ─────────────────────────────────────────

router.post('/orgs', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'name must be at least 2 characters' });
    }

    let slug = slugifyName(name);
    if (!slug) slug = 'org';

    // Resolve slug conflicts by appending a random 4-digit number
    let existing = await prisma.organization.findUnique({ where: { slug } });
    while (existing) {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      slug = `${slugifyName(name)}-${suffix}`;
      existing = await prisma.organization.findUnique({ where: { slug } });
    }

    const [org, membership] = await prisma.$transaction(async (tx) => {
      const createdOrg = await tx.organization.create({
        data: { name: name.trim(), slug },
      });
      const createdMembership = await tx.organizationMembership.create({
        data: { orgId: createdOrg.id, userId: req.user.id, role: 'OWNER' },
      });
      return [createdOrg, createdMembership];
    });

    res.status(201).json({
      org: { id: org.id, name: org.name, slug: org.slug, createdAt: org.createdAt },
      membership: { role: membership.role },
    });
  } catch (err) {
    console.error('Create org error:', err);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

// ── GET /orgs — List user's orgs ─────────────────────────────────────────────

router.get('/orgs', authMiddleware, async (req, res) => {
  try {
    const memberships = await prisma.organizationMembership.findMany({
      where: { userId: req.user.id },
      include: {
        org: {
          include: {
            _count: { select: { memberships: true } },
          },
        },
      },
    });

    const orgs = memberships.map((m) => ({
      id: m.org.id,
      name: m.org.name,
      slug: m.org.slug,
      role: m.role,
      memberCount: m.org._count.memberships,
    }));

    res.json({ orgs });
  } catch (err) {
    console.error('List orgs error:', err);
    res.status(500).json({ error: 'Failed to list organizations' });
  }
});

// ── GET /orgs/:id — Get org detail ────────────────────────────────────────────

router.get('/orgs/:id', authMiddleware, async (req, res) => {
  try {
    const membership = await requireMembership(req.params.id, req.user.id);
    if (!membership) return res.status(403).json({ error: 'Forbidden' });

    const org = await prisma.organization.findUnique({
      where: { id: req.params.id },
      include: {
        memberships: {
          include: {
            user: { select: { id: true, name: true, email: true, image: true } },
          },
        },
      },
    });

    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const members = org.memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
      role: m.role,
      joinedAt: m.joinedAt,
    }));

    res.json({
      id: org.id,
      name: org.name,
      slug: org.slug,
      avatarUrl: org.avatarUrl,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
      members,
    });
  } catch (err) {
    console.error('Get org error:', err);
    res.status(500).json({ error: 'Failed to fetch organization' });
  }
});

// ── POST /orgs/:id/invite — Invite user by email ─────────────────────────────

router.post('/orgs/:id/invite', authMiddleware, async (req, res) => {
  try {
    const callerMembership = await requireOrgRole(req.params.id, req.user.id, 'OWNER', 'ADMIN');
    if (!callerMembership) return res.status(403).json({ error: 'Forbidden' });

    const { email, role } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'email is required' });
    }
    if (!['MEMBER', 'ADMIN'].includes(role)) {
      return res.status(400).json({ error: 'role must be MEMBER or ADMIN' });
    }

    const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    // Check if the email belongs to an existing member
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingUser) {
      const alreadyMember = await requireMembership(org.id, existingUser.id);
      if (alreadyMember) return res.status(409).json({ error: 'Already a member' });
    }

    // Check for a pending invitation
    const pendingInvite = await prisma.invitation.findFirst({
      where: { orgId: org.id, email, expiresAt: { gt: new Date() } },
    });
    if (pendingInvite) return res.status(409).json({ error: 'Invite already pending' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.invitation.create({
      data: { orgId: org.id, email, role, token, expiresAt },
    });

    const inviteUrl = `${process.env.NEXTAUTH_URL}/invite/${token}`;
    await sendInvitationEmail(email, org.name, inviteUrl);

    res.json({ success: true });
  } catch (err) {
    console.error('Invite error:', err);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

// ── GET /invitations/:token — Get invite info (no auth required) ──────────────

router.get('/invitations/:token', async (req, res) => {
  try {
    const invitation = await prisma.invitation.findUnique({
      where: { token: req.params.token },
      include: { org: { select: { name: true } } },
    });

    if (!invitation) return res.status(404).json({ error: 'Invitation not found' });

    if (invitation.expiresAt < new Date()) {
      return res.json({ expired: true });
    }

    res.json({
      org: { name: invitation.org.name },
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    });
  } catch (err) {
    console.error('Get invitation error:', err);
    res.status(500).json({ error: 'Failed to fetch invitation' });
  }
});

// ── POST /invitations/:token/accept — Accept invite ──────────────────────────

router.post('/invitations/:token/accept', authMiddleware, async (req, res) => {
  try {
    const invitation = await prisma.invitation.findUnique({
      where: { token: req.params.token },
    });

    if (!invitation) return res.status(404).json({ error: 'Invitation not found' });

    if (invitation.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Invitation expired' });
    }

    // Fetch caller email to validate
    const caller = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { email: true },
    });

    if (!caller || caller.email !== invitation.email) {
      return res.status(403).json({ error: 'This invite is for a different email' });
    }

    const alreadyMember = await requireMembership(invitation.orgId, req.user.id);
    if (alreadyMember) return res.status(409).json({ error: 'Already a member of this organization' });

    await prisma.$transaction([
      prisma.organizationMembership.create({
        data: { orgId: invitation.orgId, userId: req.user.id, role: invitation.role },
      }),
      prisma.invitation.delete({ where: { id: invitation.id } }),
    ]);

    res.json({ success: true, orgId: invitation.orgId });
  } catch (err) {
    console.error('Accept invitation error:', err);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// ── DELETE /orgs/:id/members/:userId — Remove member ─────────────────────────

router.delete('/orgs/:id/members/:userId', authMiddleware, async (req, res) => {
  try {
    const callerMembership = await requireOrgRole(req.params.id, req.user.id, 'OWNER', 'ADMIN');
    if (!callerMembership) return res.status(403).json({ error: 'Forbidden' });

    const targetMembership = await requireMembership(req.params.id, req.params.userId);
    if (!targetMembership) return res.status(404).json({ error: 'Member not found' });

    // ADMIN cannot remove an OWNER
    if (callerMembership.role === 'ADMIN' && targetMembership.role === 'OWNER') {
      return res.status(403).json({ error: 'Admins cannot remove owners' });
    }

    // OWNER cannot remove themselves — use transfer ownership instead
    if (req.user.id === req.params.userId && callerMembership.role === 'OWNER') {
      return res.status(400).json({ error: 'Owners cannot remove themselves. Transfer ownership first.' });
    }

    await prisma.organizationMembership.delete({
      where: { orgId_userId: { orgId: req.params.id, userId: req.params.userId } },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Remove member error:', err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// ── PATCH /orgs/:id/members/:userId — Change role ────────────────────────────

router.patch('/orgs/:id/members/:userId', authMiddleware, async (req, res) => {
  try {
    const callerMembership = await requireOrgRole(req.params.id, req.user.id, 'OWNER');
    if (!callerMembership) return res.status(403).json({ error: 'Forbidden: only owners can change roles' });

    const { role } = req.body;
    if (!['MEMBER', 'ADMIN'].includes(role)) {
      return res.status(400).json({ error: 'role must be MEMBER or ADMIN' });
    }

    const targetMembership = await requireMembership(req.params.id, req.params.userId);
    if (!targetMembership) return res.status(404).json({ error: 'Member not found' });

    // Prevent demoting the last owner
    if (targetMembership.role === 'OWNER') {
      const ownerCount = await prisma.organizationMembership.count({
        where: { orgId: req.params.id, role: 'OWNER' },
      });
      if (ownerCount <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last owner' });
      }
    }

    await prisma.organizationMembership.update({
      where: { orgId_userId: { orgId: req.params.id, userId: req.params.userId } },
      data: { role },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Change role error:', err);
    res.status(500).json({ error: 'Failed to change role' });
  }
});

// ── GET /orgs/:id/projects — List org's projects ─────────────────────────────

router.get('/orgs/:id/projects', authMiddleware, async (req, res) => {
  try {
    const membership = await requireMembership(req.params.id, req.user.id);
    if (!membership) return res.status(403).json({ error: 'Forbidden' });

    const projects = await prisma.project.findMany({
      where: { orgId: req.params.id },
      select: {
        id: true,
        name: true,
        slug: true,
        latestDeploymentId: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ projects });
  } catch (err) {
    console.error('List org projects error:', err);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

module.exports = router;
