const express = require('express');
const crypto = require('crypto');
const { prisma } = require('../../lib/prisma');
const logger = require('../../lib/logger');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { getDashboardAnalytics, getProjectAnalytics } = require('../services/analyticsService');
const { projectAccessWhere } = require('../services/projectAccessService');
const { getProjectUsage } = require('../services/usageService');

const router = express.Router();

// POST /collect — public pixel/beacon endpoint (no auth, called by injected script)
router.post('/collect', async (req, res) => {
  // CORS: allow any origin (the site being tracked could be on any domain)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.sendStatus(204);

  try {
    const { projectSlug, path, vitals } = req.body;
    if (!projectSlug) return res.sendStatus(400);

    const project = await prisma.project.findUnique({
      where: { slug: projectSlug },
      select: { id: true },
    });
    if (!project) return res.sendStatus(404);

    await prisma.requestLog.create({
      data: {
        projectId: project.id,
        path: (path || '/').slice(0, 500),
        status: 200,
        latencyMs: vitals?.lcp ? Math.round(vitals.lcp) : 0,
        cached: false,
        country: req.headers['cf-ipcountry'] || null,
      },
    });

    res.sendStatus(204);
  } catch (err) {
    console.error('[Collect] Error:', err.message);
    res.sendStatus(500);
  }
});

// OPTIONS preflight for /collect
router.options('/collect', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

router.post("/track", async (req, res) => {
  try {
    const secret = req.headers["x-internal-secret"];
    const expected = process.env.INTERNAL_SECRET;
    if (!expected || !secret || !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const payload = req.body;
    const events = Array.isArray(payload) ? payload : [payload];
    
    const validEvents = events.filter(e => e && e.projectId);
    if (validEvents.length === 0) {
      return res.status(400).json({ error: "Missing valid projectId in payload" });
    }

    await prisma.requestLog.createMany({
      data: validEvents.map(e => ({
        projectId: e.projectId,
        deploymentId: e.deploymentId || null,
        path: e.path || "/",
        status: e.status || 200,
        latencyMs: e.latencyMs || 0,
        cached: Boolean(e.cached),
        country: e.country,
        city: e.city,
        bytes: e.bytes || 0,
      }))
    });

    res.json({ success: true, count: validEvents.length });
  } catch (err) {
    console.error("Telemetry error:", err);
    res.status(500).json({ error: "Failed to save telemetry" });
  }
});

router.get(
  "/analytics/dashboard",
  authMiddleware,
  async (req, res) => {
    try {
      const data = await getDashboardAnalytics(req.user.id);
      res.json({ data });
    } catch (err) {
      console.error("Analytics error:", err);
      res.status(500).json({ error: "Analytics failed" });
    }
  }
);

router.get(
  "/analytics/project/:id",
  authMiddleware,
  async (req, res) => {
    try {
      const project = await prisma.project.findFirst({
        where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'MEMBER') },
        select: { id: true },
      });
      if (!project) return res.status(404).json({ error: "Not found" });

      const data = await getProjectAnalytics(project.id);
      res.json({ data });
    } catch (err) {
      logger.error({ err }, "Project analytics error");
      res.status(500).json({ error: "Analytics failed" });
    }
  }
);

// GET /project/:id/usage — real cost/usage numbers for the current month
// (build minutes, request count, bandwidth, cache hit rate). See
// usageService.js for exactly what is and isn't measured.
router.get("/project/:id/usage", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'MEMBER') },
      select: { id: true },
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    const data = await getProjectUsage(project.id);
    res.json({ data });
  } catch (err) {
    logger.error({ err }, "Project usage error");
    res.status(500).json({ error: "Failed to fetch usage" });
  }
});

// GET /project/:id/request-logs — filterable/paginated raw request log
// rows, for a log-search UI. Distinct from /project/:id/usage and
// /project/:id/analytics (both aggregates only) — this returns individual
// RequestLog rows so an operator can find "which requests 500'd on
// /api/checkout in the last hour."
router.get("/project/:id/request-logs", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...projectAccessWhere(req.user.id, 'MEMBER') },
      select: { id: true },
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    const where = { projectId: project.id };

    if (req.query.path) where.path = { contains: String(req.query.path) };

    if (req.query.status) {
      const status = String(req.query.status);
      if (status === '2xx') where.status = { gte: 200, lt: 300 };
      else if (status === '3xx') where.status = { gte: 300, lt: 400 };
      else if (status === '4xx') where.status = { gte: 400, lt: 500 };
      else if (status === '5xx') where.status = { gte: 500, lt: 600 };
      else if (/^\d+$/.test(status)) where.status = parseInt(status, 10);
    }

    if (req.query.since || req.query.until) {
      where.timestamp = {};
      if (req.query.since) where.timestamp.gte = new Date(String(req.query.since));
      if (req.query.until) where.timestamp.lte = new Date(String(req.query.until));
    }

    const limit = Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 500);

    const logs = await prisma.requestLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: { id: true, path: true, status: true, latencyMs: true, cached: true, country: true, bytes: true, timestamp: true, deploymentId: true },
    });

    res.json({ logs });
  } catch (err) {
    logger.error({ err }, "Request log search error");
    res.status(500).json({ error: "Failed to fetch request logs" });
  }
});

module.exports = router;