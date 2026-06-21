const express = require('express');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get("/project/:id/insights", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!project) return res.status(404).json({ error: "Not found" });

    // Fetch the latest active deployment
    const activeDeployment = await prisma.deployment.findFirst({
      where: { projectId: project.id, isActive: true },
    });

    if (!activeDeployment) {
      return res.json({ insights: [] });
    }

    // Fetch insights for this deployment
    const insights = await prisma.deploymentRecommendation.findMany({
      where: { deploymentId: activeDeployment.id },
      orderBy: { confidence: "desc" }
    });

    res.json({ insights });
  } catch (err) {
    console.error("Fetch insights error:", err);
    res.status(500).json({ error: "Failed to fetch AI insights" });
  }
});

module.exports = router;
