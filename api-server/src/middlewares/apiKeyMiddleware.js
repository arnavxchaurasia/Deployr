const crypto = require('crypto');
const { prisma } = require('../../lib/prisma');

// Accepts requests authenticated with an API key via:
//   Authorization: Bearer dplr_xxxxx
// Falls through to the next middleware if no Bearer token present,
// so it can be composed with authMiddleware for dual-auth routes.
async function apiKeyMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer dplr_')) {
    return next();
  }

  const rawKey = authHeader.slice(7); // strip 'Bearer '
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  try {
    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: { user: { select: { id: true, emailVerified: true } } },
    });

    if (!apiKey) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Fire-and-forget lastUsedAt update — don't block the request
    prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => {});

    req.user = { id: apiKey.user.id, emailVerified: apiKey.user.emailVerified };
    req.authMethod = 'api_key';
    next();
  } catch (err) {
    console.error('API key auth error:', err);
    return res.status(503).json({ error: 'Service temporarily unavailable' });
  }
}

module.exports = { apiKeyMiddleware };