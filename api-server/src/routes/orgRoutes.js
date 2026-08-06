const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { sendInvitationEmail } = require('../services/mailService');
const { getOrgUsage } = require('../services/usageService');
const { sendOrgWebhook } = require('../services/orgWebhookService');

const router = express.Router();

// Seat-based team billing — ₹500/seat/month, priced off the team's current
// member count at time of upgrade. There's no recurring subscription/webhook
// wired up yet, so growing the team past seatsPurchased needs re-running
// checkout (see the seatsExceeded flag on GET /orgs/:id/billing) rather than
// being billed automatically — that would need Razorpay Subscriptions, a
// separate integration from the one-off orders used here and elsewhere in
// this codebase.
const PRICE_PER_SEAT_PAISE = 50000; // ₹500

const getRazorpayInstance = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET) {
    throw new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_SECRET.');
  }
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_SECRET });
};

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

    const org = await prisma.organization.findUnique({
      where: { id: req.params.id },
      select: { id: true, plan: true, name: true, _count: { select: { memberships: true } } },
    });
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const FREE_TIER_MEMBER_LIMIT = 3;
    if (org.plan === 'FREE' && org._count.memberships >= FREE_TIER_MEMBER_LIMIT) {
      return res.status(402).json({
        error: `Free teams are limited to ${FREE_TIER_MEMBER_LIMIT} members. Upgrade to invite more.`,
      });
    }

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

    sendOrgWebhook(invitation.orgId, 'member.joined', {
      userId: req.user.id,
      email: invitation.email,
      role: invitation.role,
    }).catch(() => {});

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

    sendOrgWebhook(req.params.id, 'member.left', {
      userId: req.params.userId,
      removedBy: req.user.id,
      wasSelf: req.user.id === req.params.userId,
    }).catch(() => {});

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

// ── GET /orgs/:id/billing — current plan/seat status ─────────────────────────

router.get('/orgs/:id/billing', authMiddleware, async (req, res) => {
  try {
    const membership = await requireMembership(req.params.id, req.user.id);
    if (!membership) return res.status(403).json({ error: 'Forbidden' });

    const org = await prisma.organization.findUnique({
      where: { id: req.params.id },
      select: { plan: true, seatsPurchased: true, _count: { select: { memberships: true } } },
    });
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const memberCount = org._count.memberships;

    res.json({
      plan: org.plan,
      memberCount,
      seatsPurchased: org.seatsPurchased,
      seatsExceeded: org.plan !== 'FREE' && memberCount > org.seatsPurchased,
      pricePerSeat: PRICE_PER_SEAT_PAISE / 100,
      freeTierMemberLimit: 3,
    });
  } catch (err) {
    console.error('Get org billing error:', err);
    res.status(500).json({ error: 'Failed to fetch billing info' });
  }
});

// GET /orgs/:id/usage — real cost/usage numbers for the current month,
// summed across every project in the org (see usageService.js).
router.get('/orgs/:id/usage', authMiddleware, async (req, res) => {
  try {
    const membership = await requireMembership(req.params.id, req.user.id);
    if (!membership) return res.status(403).json({ error: 'Forbidden' });

    const data = await getOrgUsage(req.params.id);
    res.json({ data });
  } catch (err) {
    console.error('Get org usage error:', err);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

// ── Audit log export (compliance/SIEM) ────────────────────────────────────────

router.get('/orgs/:id/audit-export', authMiddleware, async (req, res) => {
  const membership = await requireOrgRole(req.params.id, req.user.id, 'OWNER', 'ADMIN');
  if (!membership) return res.status(403).json({ error: 'Forbidden' });

  const org = await prisma.organization.findUnique({
    where: { id: req.params.id },
    select: { auditExportWebhookUrl: true },
  });
  if (!org) return res.status(404).json({ error: 'Organization not found' });

  res.json({ enabled: !!org.auditExportWebhookUrl, webhookUrl: org.auditExportWebhookUrl });
});

router.post('/orgs/:id/audit-export', authMiddleware, async (req, res) => {
  try {
    const membership = await requireOrgRole(req.params.id, req.user.id, 'OWNER', 'ADMIN');
    if (!membership) return res.status(403).json({ error: 'Forbidden' });

    const { webhookUrl } = req.body;
    if (!webhookUrl || typeof webhookUrl !== 'string') {
      return res.status(400).json({ error: 'webhookUrl is required' });
    }
    try { new URL(webhookUrl); } catch { return res.status(400).json({ error: 'webhookUrl must be a valid URL' }); }

    await prisma.organization.update({
      where: { id: req.params.id },
      data: { auditExportWebhookUrl: webhookUrl },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Set audit export webhook error:', err);
    res.status(500).json({ error: 'Failed to save audit export webhook' });
  }
});

router.delete('/orgs/:id/audit-export', authMiddleware, async (req, res) => {
  const membership = await requireOrgRole(req.params.id, req.user.id, 'OWNER', 'ADMIN');
  if (!membership) return res.status(403).json({ error: 'Forbidden' });

  await prisma.organization.update({
    where: { id: req.params.id },
    data: { auditExportWebhookUrl: null },
  });

  res.json({ success: true });
});

// ── Org lifecycle webhook (member joined/left, project transferred, plan changed) ─

router.get('/orgs/:id/webhook', authMiddleware, async (req, res) => {
  const membership = await requireOrgRole(req.params.id, req.user.id, 'OWNER', 'ADMIN');
  if (!membership) return res.status(403).json({ error: 'Forbidden' });

  const org = await prisma.organization.findUnique({
    where: { id: req.params.id },
    select: { webhookUrl: true },
  });
  if (!org) return res.status(404).json({ error: 'Organization not found' });

  res.json({ enabled: !!org.webhookUrl, webhookUrl: org.webhookUrl });
});

router.post('/orgs/:id/webhook', authMiddleware, async (req, res) => {
  try {
    const membership = await requireOrgRole(req.params.id, req.user.id, 'OWNER', 'ADMIN');
    if (!membership) return res.status(403).json({ error: 'Forbidden' });

    const { webhookUrl } = req.body;
    if (!webhookUrl || typeof webhookUrl !== 'string') {
      return res.status(400).json({ error: 'webhookUrl is required' });
    }
    try { new URL(webhookUrl); } catch { return res.status(400).json({ error: 'webhookUrl must be a valid URL' }); }

    await prisma.organization.update({
      where: { id: req.params.id },
      data: { webhookUrl },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Set org webhook error:', err);
    res.status(500).json({ error: 'Failed to save org webhook' });
  }
});

router.delete('/orgs/:id/webhook', authMiddleware, async (req, res) => {
  const membership = await requireOrgRole(req.params.id, req.user.id, 'OWNER', 'ADMIN');
  if (!membership) return res.status(403).json({ error: 'Forbidden' });

  await prisma.organization.update({
    where: { id: req.params.id },
    data: { webhookUrl: null },
  });

  res.json({ success: true });
});

// ── POST /orgs/:id/billing/create-order — buy seats for the current team size ─

router.post('/orgs/:id/billing/create-order', authMiddleware, async (req, res) => {
  try {
    const membership = await requireOrgRole(req.params.id, req.user.id, 'OWNER');
    if (!membership) return res.status(403).json({ error: 'Forbidden: only owners can manage billing' });

    const memberCount = await prisma.organizationMembership.count({ where: { orgId: req.params.id } });
    const seats = Math.max(memberCount, 1);
    const amountInPaise = seats * PRICE_PER_SEAT_PAISE;

    const rzp = getRazorpayInstance();
    const order = await rzp.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `org_${Date.now()}_${req.params.id.slice(0, 8)}`,
    });

    await prisma.organization.update({
      where: { id: req.params.id },
      data: { razorpayOrderId: order.id },
    });

    res.json({ success: true, orderId: order.id, amount: amountInPaise, seats, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('Org billing order error:', err);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
});

// ── POST /orgs/:id/billing/verify — confirm payment, upgrade to PRO ───────────

router.post('/orgs/:id/billing/verify', authMiddleware, async (req, res) => {
  try {
    const membership = await requireOrgRole(req.params.id, req.user.id, 'OWNER');
    if (!membership) return res.status(403).json({ error: 'Forbidden: only owners can manage billing' });

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const secret = process.env.RAZORPAY_SECRET;
    if (!secret) return res.status(500).json({ error: 'Payment verification is not configured' });

    const shasum = crypto.createHmac('sha256', secret);
    shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const digest = shasum.digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(razorpay_signature))) {
      return res.status(400).json({ error: 'Transaction not legit!' });
    }

    const memberCount = await prisma.organizationMembership.count({ where: { orgId: req.params.id } });

    await prisma.organization.update({
      where: { id: req.params.id },
      data: { plan: 'PRO', seatsPurchased: memberCount },
    });

    sendOrgWebhook(req.params.id, 'plan.changed', {
      plan: 'PRO',
      seatsPurchased: memberCount,
      changedBy: req.user.id,
    }).catch(() => {});

    res.json({ success: true, seatsPurchased: memberCount });
  } catch (err) {
    console.error('Org billing verify error:', err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

module.exports = router;
