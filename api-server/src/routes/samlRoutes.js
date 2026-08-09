const express = require('express');
const crypto = require('crypto');
const { prisma } = require('../../lib/prisma');
const logger = require('../../lib/logger');
const { buildSamlClient, issueSsoCode, verifySsoCode } = require('../services/samlService');

const FRONTEND_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

const router = express.Router();

function domainOf(email) {
  const at = email.lastIndexOf('@');
  return at === -1 ? null : email.slice(at + 1).toLowerCase();
}

// GET /auth/sso/check?email=... — public. The login page calls this before
// showing a password field; if the email's domain has SSO configured, the
// frontend redirects to ssoUrl instead of asking for a password.
router.get('/auth/sso/check', async (req, res) => {
  const email = typeof req.query.email === 'string' ? req.query.email : '';
  const domain = domainOf(email);
  if (!domain) return res.json({ ssoUrl: null });

  const org = await prisma.organization.findFirst({
    where: { ssoDomain: domain, samlEnabled: true },
    select: { id: true },
  });

  res.json({ ssoUrl: org ? `${process.env.APP_URL || 'http://localhost:8000'}/auth/saml/${org.id}/login` : null });
});

// GET /auth/saml/:orgId/login — redirects the browser to the org's IdP.
router.get('/auth/saml/:orgId/login', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: req.params.orgId } });
    if (!org?.samlEnabled || !org.samlEntryPoint || !org.samlIssuer || !org.samlCert) {
      return res.status(404).send('SSO is not configured for this organization.');
    }

    const saml = buildSamlClient(org, org.id);
    const url = await saml.getAuthorizeUrlAsync('', req.hostname, {});
    res.redirect(url);
  } catch (err) {
    logger.error({ err }, '[SAML] Failed to build authorize URL');
    res.status(500).send('Failed to start SSO login.');
  }
});

// POST /auth/saml/:orgId/acs — Assertion Consumer Service. The IdP POSTs
// the SAMLResponse here after the user authenticates with it.
router.post('/auth/saml/:orgId/acs', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: req.params.orgId } });
    if (!org?.samlEnabled || !org.samlEntryPoint || !org.samlIssuer || !org.samlCert) {
      return res.status(404).send('SSO is not configured for this organization.');
    }

    const saml = buildSamlClient(org, org.id);
    const { profile } = await saml.validatePostResponseAsync(req.body);

    const email = profile?.email || profile?.nameID;
    if (!email) {
      return res.status(400).send('SSO assertion did not include an email address.');
    }

    if (domainOf(email) !== org.ssoDomain) {
      logger.warn(`[SAML] Assertion email domain doesn't match org ${org.id}'s configured SSO domain`);
      return res.status(403).send("This account's email domain isn't authorized for this organization's SSO.");
    }

    // The IdP vouches for this identity — auto-provision and auto-join,
    // same trust model as the existing OAuth (Google/GitHub) sync path.
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, name: profile?.displayName || email.split('@')[0], emailVerified: true },
      });
    }

    await prisma.organizationMembership.upsert({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
      update: {},
      create: { orgId: org.id, userId: user.id, role: 'MEMBER' },
    });

    const code = issueSsoCode(user.id);
    res.redirect(`${FRONTEND_URL}/auth/sso-callback?code=${encodeURIComponent(code)}`);
  } catch (err) {
    logger.error({ err }, '[SAML] Assertion validation failed');
    res.status(400).send('SSO sign-in failed — the assertion could not be validated.');
  }
});

// POST /auth/sso/exchange — called server-side by the frontend's NextAuth
// "sso" Credentials provider (never directly by the browser) to trade a
// one-time code for the user record NextAuth mints a real session from.
router.post('/auth/sso/exchange', async (req, res) => {
  try {
    const secret = req.headers['x-internal-secret'];
    if (!process.env.INTERNAL_SECRET || !secret ||
        !crypto.timingSafeEqual(Buffer.from(String(secret)), Buffer.from(process.env.INTERNAL_SECRET))) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = verifySsoCode(req.body?.code);
    if (!userId) return res.status(401).json({ error: 'Invalid or expired code' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ error: 'User not found' });

    res.json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    logger.error({ err }, '[SAML] SSO exchange failed');
    res.status(500).json({ error: 'Exchange failed' });
  }
});

module.exports = router;
