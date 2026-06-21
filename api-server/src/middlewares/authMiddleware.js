const { getToken } = require("next-auth/jwt");
const { prisma } = require("../../lib/prisma");

async function authMiddleware(req, res, next) {
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
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(401).json({ error: "Unauthorized" });
  }
}

module.exports = { authMiddleware };
