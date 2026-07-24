const express = require('express');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { generateInsights } = require('../services/insightsService');

const router = express.Router();

// ── GET /project/:id/insights ─────────────────────────────────────────────────

router.get('/project/:id/insights', authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!project) return res.status(404).json({ error: 'Not found' });

    const activeDeployment = await prisma.deployment.findFirst({
      where: { projectId: project.id, isActive: true },
    });

    if (!activeDeployment) {
      return res.json({ insights: [] });
    }

    // Regenerate recommendations based on latest signals before returning
    await generateInsights(project.id, activeDeployment.id);

    const insights = await prisma.deploymentRecommendation.findMany({
      where: { deploymentId: activeDeployment.id },
      orderBy: { confidence: 'desc' },
    });

    res.json({ insights });
  } catch (err) {
    console.error('Fetch insights error:', err);
    res.status(500).json({ error: 'Failed to fetch AI insights' });
  }
});

// ── PATCH /project/:id/insights/:recommendationId — Mark as applied/dismissed ─

router.patch('/project/:id/insights/:recommendationId', authMiddleware, async (req, res) => {
  try {
    const { applied } = req.body;
    if (typeof applied !== 'boolean') {
      return res.status(400).json({ error: 'applied must be a boolean' });
    }

    // Verify the project belongs to this user
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: { id: true },
    });

    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Verify the recommendation belongs to a deployment in this project
    const recommendation = await prisma.deploymentRecommendation.findFirst({
      where: {
        id: req.params.recommendationId,
        deployment: { projectId: project.id },
      },
    });

    if (!recommendation) return res.status(404).json({ error: 'Recommendation not found' });

    await prisma.deploymentRecommendation.update({
      where: { id: req.params.recommendationId },
      data: { applied },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Update recommendation error:', err);
    res.status(500).json({ error: 'Failed to update recommendation' });
  }
});

module.exports = router;