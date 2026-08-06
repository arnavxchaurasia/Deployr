'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Shared secret between api-server and the Cloudflare worker so the worker
// can verify a protection session cookie itself (via Web Crypto HMAC)
// without a round trip to the API on every request.
const SECRET = process.env.PREVIEW_PROTECTION_SECRET;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  if (!hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}

/**
 * Issue a signed session token proving the bearer already entered the
 * correct password for this project's preview deployments.
 */
function issueSessionToken(projectId) {
  if (!SECRET) throw new Error('PREVIEW_PROTECTION_SECRET is not configured');
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${projectId}.${exp}`;
  const encoded = Buffer.from(payload).toString('base64url');
  return `${encoded}.${sign(payload)}`;
}

function verifySessionToken(token, projectId) {
  if (!SECRET || !token) return false;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return false;

  let payload;
  try {
    payload = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return false;
  }

  const expected = sign(payload);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }

  const [tokenProjectId, expStr] = payload.split('.');
  const exp = parseInt(expStr, 10);
  return tokenProjectId === projectId && Number.isFinite(exp) && Date.now() < exp;
}

module.exports = { hashPassword, verifyPassword, issueSessionToken, verifySessionToken };
