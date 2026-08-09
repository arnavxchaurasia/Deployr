'use strict';

const express = require('express');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/authMiddleware');
const { relayTunnelRequest } = require('../services/tunnelService');
const socketUtil = require('../utils/socket');

const router = express.Router();

// Active tunnels: tunnelId → { userId, projectId?, createdAt }
const activeTunnels = new Map();

// POST /tunnel/register — authenticated; returns tunnelId + public URL
router.post('/tunnel/register', requireAuth, (req, res) => {
  const tunnelId = crypto.randomBytes(12).toString('hex');
  activeTunnels.set(tunnelId, {
    userId: req.user.id,
    projectId: req.body.projectId ?? null,
    createdAt: Date.now(),
  });

  const baseUrl = process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 9000}`;
  res.json({
    tunnelId,
    tunnelUrl: `${baseUrl}/tunnel/${tunnelId}`,
  });
});

// ALL /tunnel/:tunnelId/* — proxies request to the connected CLI client
router.all('/tunnel/:tunnelId/*', async (req, res) => {
  const { tunnelId } = req.params;
  const subPath = '/' + (req.params[0] || '');

  // Collect raw body as base64 for binary-safe transfer
  let bodyBase64 = null;
  if (req.rawBody && req.rawBody.length > 0) {
    bodyBase64 = req.rawBody.toString('base64');
  }

  // Strip hop-by-hop headers
  const headers = { ...req.headers };
  for (const h of ['host', 'connection', 'upgrade', 'keep-alive', 'transfer-encoding', 'te', 'proxy-authorization']) {
    delete headers[h];
  }

  let io;
  try { io = socketUtil.getIO(); } catch { io = null; }
  if (!io) {
    return res.status(503).json({ error: 'Tunnel service unavailable' });
  }

  try {
    const payload = await relayTunnelRequest(io, tunnelId, {
      method: req.method,
      path: subPath + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''),
      headers,
      bodyBase64,
    });

    // payload = { statusCode, headers, bodyBase64 }
    const replyHeaders = payload.headers || {};
    for (const [k, v] of Object.entries(replyHeaders)) {
      try { res.setHeader(k, v); } catch { /* skip invalid header */ }
    }
    const body = payload.bodyBase64 ? Buffer.from(payload.bodyBase64, 'base64') : Buffer.alloc(0);
    res.status(payload.statusCode || 200).end(body);
  } catch (err) {
    if (err.message === 'No tunnel client connected for this id') {
      res.status(502).json({ error: 'No tunnel client connected — is `deployr dev --tunnel` running?' });
    } else if (err.message === 'Tunnel client did not respond in time') {
      res.status(504).json({ error: 'Tunnel client timed out' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

module.exports = router;
