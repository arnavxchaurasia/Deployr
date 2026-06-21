const express = require('express');
const { z } = require('zod');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { rateLimit } = require('../middlewares/rateLimitMiddleware');
const { encrypt, decrypt } = require('../../lib/crypto');
const crypto = require('crypto');
const dns = require('dns/promises');
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const bcrypt = require('bcryptjs');
const { ecsClient, CLUSTER, TASK, RunTaskCommand } = require('../services/awsService');
const { getDashboardAnalytics, getProjectAnalytics } = require('../services/analyticsService');

const router = express.Router();

router.post("/track", async (req, res) => {
  try {
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
      const data = await getProjectAnalytics(req.params.id);
      res.json({ data });
    } catch (err) {
      console.error("Project analytics error:", err);
      res.status(500).json({ error: "Analytics failed" });
    }
  }
);

module.exports = router;