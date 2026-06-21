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
    const { projectId, path, status, latencyMs, cached, country, city } = req.body;
    
    if (!projectId) {
      return res.status(400).json({ error: "Missing projectId" });
    }

    await prisma.requestLog.create({
      data: {
        projectId,
        path: path || "/",
        status: status || 200,
        latencyMs: latencyMs || 0,
        cached: Boolean(cached),
        country,
        city,
      }
    });

    res.json({ success: true });
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