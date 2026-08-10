const express = require('express');
const { z } = require('zod');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

// GET /deployments/:id/annotations
router.get('/deployments/:id/annotations', authMiddleware, async (req, res) => {
  try {
    const deployment = await prisma.deployment.findUnique({
      where: { id: req.params.id },
      include: { project: true },
    });
    if (!deployment) return res.status(404).json({ error: 'Deployment not found' });

    const annotations = await prisma.deploymentAnnotation.findMany({
      where: { deploymentId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
    return res.json(annotations);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const createSchema = z.object({
  note: z.string().min(1),
  tag: z.string().optional(),
});

// POST /deployments/:id/annotations
router.post('/deployments/:id/annotations', authMiddleware, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const deployment = await prisma.deployment.findUnique({ where: { id: req.params.id } });
    if (!deployment) return res.status(404).json({ error: 'Deployment not found' });

    const annotation = await prisma.deploymentAnnotation.create({
      data: {
        deploymentId: req.params.id,
        userId: req.user.id,
        note: parsed.data.note,
        tag: parsed.data.tag ?? null,
      },
    });
    return res.status(201).json(annotation);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /deployments/:id/annotations/:annotationId
router.delete('/deployments/:id/annotations/:annotationId', authMiddleware, async (req, res) => {
  try {
    const annotation = await prisma.deploymentAnnotation.findUnique({
      where: { id: req.params.annotationId },
    });
    if (!annotation) return res.status(404).json({ error: 'Annotation not found' });
    if (annotation.deploymentId !== req.params.id)
      return res.status(404).json({ error: 'Annotation not found' });
    if (annotation.userId !== req.user.id)
      return res.status(403).json({ error: 'Cannot delete another user\'s annotation' });

    await prisma.deploymentAnnotation.delete({ where: { id: req.params.annotationId } });
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
