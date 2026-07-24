const express = require('express');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { encrypt, decrypt } = require('../../lib/crypto');

const router = express.Router();

// POST /auth/2fa/setup — generate secret + QR code URI
router.post('/auth/2fa/setup', authMiddleware, async (req, res) => {
  try {
    const secret = authenticator.generateSecret();
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true } });
    const otpauth = authenticator.keyuri(user.email, 'Deployr', secret);
    const qrDataUrl = await QRCode.toDataURL(otpauth);

    // Store secret encrypted but NOT enabled yet — user must verify first
    await prisma.user.update({
      where: { id: req.user.id },
      data: { totpSecret: encrypt(secret), totpEnabled: false },
    });

    res.json({ qrDataUrl, secret });
  } catch (err) {
    console.error('2FA setup error:', err);
    res.status(500).json({ error: 'Failed to set up 2FA' });
  }
});

// POST /auth/2fa/verify — confirm a TOTP code to enable 2FA
router.post('/auth/2fa/verify', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'code required' });

    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { totpSecret: true } });
    if (!user?.totpSecret) return res.status(400).json({ error: '2FA not set up' });

    const secret = decrypt(user.totpSecret);
    const valid = authenticator.verify({ token: code.replace(/\s/g, ''), secret });
    if (!valid) return res.status(400).json({ error: 'Invalid code' });

    await prisma.user.update({ where: { id: req.user.id }, data: { totpEnabled: true } });
    res.json({ success: true });
  } catch (err) {
    console.error('2FA verify error:', err);
    res.status(500).json({ error: 'Failed to verify 2FA' });
  }
});

// POST /auth/2fa/disable — disable 2FA (requires valid code)
router.post('/auth/2fa/disable', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'code required' });

    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { totpSecret: true, totpEnabled: true } });
    if (!user?.totpEnabled) return res.status(400).json({ error: '2FA is not enabled' });

    const secret = decrypt(user.totpSecret);
    const valid = authenticator.verify({ token: code.replace(/\s/g, ''), secret });
    if (!valid) return res.status(400).json({ error: 'Invalid code' });

    await prisma.user.update({
      where: { id: req.user.id },
      data: { totpEnabled: false, totpSecret: null },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('2FA disable error:', err);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

// GET /auth/2fa/status — check if 2FA is enabled for current user
router.get('/auth/2fa/status', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { totpEnabled: true } });
    res.json({ enabled: user?.totpEnabled ?? false });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch 2FA status' });
  }
});

module.exports = { totpRouter: router };
