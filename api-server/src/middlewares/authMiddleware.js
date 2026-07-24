const { getToken } = require("next-auth/jwt");
const { prisma } = require("../../lib/prisma");
const { apiKeyMiddleware } = require("./apiKeyMiddleware");

// Accepts both NextAuth session cookies and API key Bearer tokens.
// API keys take priority — if the Authorization header has a valid dplr_ key
// we skip the JWT check entirely.
async function authMiddleware(req, res, next) {
  // Try API key first
  if (req.headers.authorization?.startsWith('Bearer dplr_')) {
    return apiKeyMiddleware(req, res, (err) => {
      if (err) return next(err);
      // apiKeyMiddleware sets req.user on success; if it didn't call next with
      // an error and req.user is set, we're authenticated.
      if (req.user) return next();
      // apiKeyMiddleware would have sent a 401 response — don't call next.
    });
  }

  try {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token?.id) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    let user;
    try {
      user = await prisma.user.findUnique({
        where: { id: token.id },
        select: { id: true, emailVerified: true },
      });
    } catch (dbErr) {
      console.error("Database unreachable in authMiddleware:", dbErr);
      return res.status(503).json({
        error: "Service temporarily unavailable. Please try again.",
      });
    }

    if (!user) {
      return res.status(401).json({ error: "Session invalid" });
    }

    req.user = { id: user.id, emailVerified: user.emailVerified };
    req.authMethod = 'session';
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(401).json({ error: "Unauthorized" });
  }
}

module.exports = { authMiddleware };