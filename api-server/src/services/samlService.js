'use strict';

const crypto = require('crypto');
const { SAML } = require('@node-saml/node-saml');

const APP_URL = process.env.APP_URL || 'http://localhost:8000';
const CODE_TTL_MS = 60 * 1000; // one-time SSO exchange code — deliberately short-lived

// One SAML client per org, built from that org's own IdP config — this
// isn't a single app-wide IdP, every org brings its own (entryPoint,
// issuer, cert), so the client has to be constructed per request rather
// than once at module load.
function buildSamlClient(org, orgId) {
  return new SAML({
    entryPoint: org.samlEntryPoint,
    issuer: org.samlIssuer || `deployr-${orgId}`,
    idpCert: org.samlCert,
    callbackUrl: `${APP_URL}/auth/saml/${orgId}/acs`,
    // We don't hold our own SP signing key — most SAML setups only require
    // the IdP to sign its response/assertion (validated via idpCert above),
    // not the SP's AuthnRequest.
    wantAssertionsSigned: true,
  });
}

// Signed, short-lived, single-use-by-expiry code handed to the frontend
// after a successful SAML assertion, so the NextAuth "sso" Credentials
// provider (running server-side in the Next.js app) can exchange it for a
// real session without ever seeing the SAML protocol itself.
function issueSsoCode(userId) {
  const secret = process.env.NEXTAUTH_SECRET || 'deployr-dev-secret';
  const exp = Date.now() + CODE_TTL_MS;
  const payload = `${userId}.${exp}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifySsoCode(code) {
  if (typeof code !== 'string') return null;
  const parts = code.split('.');
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;

  const secret = process.env.NEXTAUTH_SECRET || 'deployr-dev-secret';
  const expected = crypto.createHmac('sha256', secret).update(`${userId}.${expStr}`).digest('hex');
  if (expected !== sig) return null;

  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;

  return userId;
}

module.exports = { buildSamlClient, issueSsoCode, verifySsoCode };
