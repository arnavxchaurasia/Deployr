const { getToken } = require("next-auth/jwt");
const { prisma } = require("../../lib/prisma");
const { apiKeyMiddleware } = require("./apiKeyMiddleware");

// API key scope enforcement — centralized here rather than per-route, since
// retrofitting every route file individually isn't maintainable. Session
// auth (a logged-in dashboard user) is never scope-restricted; this only
// applies to the "Authorization: Bearer dplr_..." path.
//
// "read" scope: GET only.
// "deploy" scope: GET, plus the specific mutating routes that trigger/manage
//   a deploy — everything else mutating (settings, env vars, domains,
//   billing, org management, deleting things) needs "full".
// "full" scope (default — every key created before scoping existed): no
//   restriction, same as today.
const DEPLOY_SCOPE_ALLOWLIST = [
  /^\/deploy$/,
  /^\/project\/[^/]+\/deploy\/upload$/,
  /^\/deployments\/[^/]+\/promote$/,
  /^\/deployments\/[^/]+\/cancel$/,
];

function isScopeAllowed(scope, method, path) {
  if (scope === 'full' || !scope) return true;
  if (method === 'GET' || method === 'HEAD') return true;
  if (scope === 'deploy') {
    return DEPLOY_SCOPE_ALLOWLIST.some((re) => re.test(path));
  }
  return false; // 'read' scope never allows a mutating request
}

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
      if (!req.user) return; // apiKeyMiddleware would have sent a 401 response

      if (!isScopeAllowed(req.apiKeyScope, req.method, req.path)) {
        return res.status(403).json({
          error: `This API key's "${req.apiKeyScope}" scope doesn't permit ${req.method} ${req.path}`,
        });
      }
      next();
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