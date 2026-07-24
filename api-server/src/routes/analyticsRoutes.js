const express = require('express');
const crypto = require('crypto');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { getDashboardAnalytics, getProjectAnalytics } = require('../services/analyticsService');

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
        path: e.path || "/",
        status: e.status || 200,
        latencyMs: e.latencyMs || 0,
        cached: Boolean(e.cached),
        country: e.country,
        city: e.city,
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
        where: { id: req.params.id, userId: req.user.id },
        select: { id: true },
      });
      if (!project) return res.status(404).json({ error: "Not found" });

      const data = await getProjectAnalytics(project.id);
      res.json({ data });
    } catch (err) {
      console.error("Project analytics error:", err);
      res.status(500).json({ error: "Analytics failed" });
    }
  }
);

module.exports = router;