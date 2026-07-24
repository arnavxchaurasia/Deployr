const express = require('express');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

// GET /project/:id/cron — list cron jobs for a project
router.get('/project/:id/cron', authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!project) return res.status(404).json({ error: 'Not found' });

    const jobs = await prisma.cronJob.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(jobs);
  } catch (err) {
    console.error('Cron list error:', err);
    res.status(500).json({ error: 'Failed to list cron jobs' });
  }
});

// POST /project/:id/cron — create a cron job
router.post('/project/:id/cron', authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!project) return res.status(404).json({ error: 'Not found' });

    const { name, expression, endpoint, useHook } = req.body;
    if (!name || !expression) return res.status(400).json({ error: 'name and expression required' });

    // Basic cron expression validation (5 or 6 parts)
    const parts = expression.trim().split(/\s+/);
    if (parts.length < 5 || parts.length > 6) {
      return res.status(400).json({ error: 'Invalid cron expression (expected 5 or 6 fields)' });
    }

    const job = await prisma.cronJob.create({
      data: {
        projectId: project.id,
        name: name.trim(),
        expression: expression.trim(),
        endpoint: endpoint?.trim() || null,
        useHook: useHook === true,
        enabled: true,
      },
    });
    res.json(job);
  } catch (err) {
    console.error('Cron create error:', err);
    res.status(500).json({ error: 'Failed to create cron job' });
  }
});

// PATCH /project/:id/cron/:jobId — update (enable/disable/edit)
router.patch('/project/:id/cron/:jobId', authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!project) return res.status(404).json({ error: 'Not found' });

    const job = await prisma.cronJob.findFirst({
      where: { id: req.params.jobId, projectId: project.id },
    });
    if (!job) return res.status(404).json({ error: 'Cron job not found' });

    const { name, expression, endpoint, useHook, enabled } = req.body;
    const updated = await prisma.cronJob.update({
      where: { id: job.id },
      data: {
        ...(name       !== undefined ? { name }      : {}),
        ...(expression !== undefined ? { expression } : {}),
        ...(endpoint   !== undefined ? { endpoint: endpoint || null } : {}),
        ...(useHook    !== undefined ? { useHook }   : {}),
        ...(enabled    !== undefined ? { enabled }   : {}),
      },
    });
    res.json(updated);
  } catch (err) {
    console.error('Cron update error:', err);
    res.status(500).json({ error: 'Failed to update cron job' });
  }
});

// DELETE /project/:id/cron/:jobId
router.delete('/project/:id/cron/:jobId', authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!project) return res.status(404).json({ error: 'Not found' });

    await prisma.cronJob.deleteMany({
      where: { id: req.params.jobId, projectId: project.id },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete cron job' });
  }
});

module.exports = { cronRouter: router };
