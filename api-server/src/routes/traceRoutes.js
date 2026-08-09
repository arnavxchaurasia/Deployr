const express = require('express');
const { z } = require('zod');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireProjectAccess } = require('../services/projectAccessService');

const router = express.Router();

const spanSchema = z.object({
  traceId: z.string().min(1).max(64),
  spanId: z.string().min(1).max(64),
  parentSpanId: z.string().max(64).optional().nullable(),
  name: z.string().min(1).max(200),
  startTime: z.string(),
  endTime: z.string(),
  status: z.enum(['ok', 'error']).optional(),
  attributes: z.record(z.string(), z.any()).optional(),
});

// POST /traces — ingest a batch of spans from a deployed function's own
// instrumentation. A simplified span shape, not a full OTLP collector — see
// the TraceSpan schema comment. Scoped by projectId in the body rather than
// a full API key, the same lightweight trust model as the /collect
// analytics beacon (this is called server-side from the customer's own
// function, not from an untrusted browser).
router.post('/traces', async (req, res) => {
  try {
    const schema = z.object({
      projectId: z.string(),
      deploymentId: z.string().optional().nullable(),
      spans: z.array(spanSchema).min(1).max(500),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId }, select: { id: true } });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const data = parsed.data.spans.map((s) => {
      const start = new Date(s.startTime);
      const end = new Date(s.endTime);
      return {
        projectId: project.id,
        deploymentId: parsed.data.deploymentId || null,
        traceId: s.traceId,
        spanId: s.spanId,
        parentSpanId: s.parentSpanId || null,
        name: s.name,
        startTime: start,
        endTime: end,
        durationMs: Math.max(0, end.getTime() - start.getTime()),
        status: s.status || null,
        attributes: s.attributes || undefined,
      };
    });

    await prisma.traceSpan.createMany({ data });
    res.sendStatus(204);
  } catch (err) {
    console.error('Trace ingest error:', err);
    res.status(500).json({ error: 'Failed to ingest spans' });
  }
});

// GET /project/:id/traces — recent traces, one row per traceId, summarized
// from its root span (the span with no parentSpanId, or the earliest-
// starting span if every span has a parent in this batch).
router.get('/project/:id/traces', authMiddleware, async (req, res) => {
  const access = await requireProjectAccess(req.user.id, req.params.id, 'MEMBER');
  if (!access) return res.status(403).json({ error: 'Forbidden' });

  const spans = await prisma.traceSpan.findMany({
    where: { projectId: req.params.id },
    orderBy: { startTime: 'desc' },
    take: 2000, // cap the scan window — this endpoint summarizes, not exports
  });

  const byTrace = new Map();
  for (const span of spans) {
    if (!byTrace.has(span.traceId)) byTrace.set(span.traceId, []);
    byTrace.get(span.traceId).push(span);
  }

  const traces = [...byTrace.entries()].map(([traceId, traceSpans]) => {
    const root = traceSpans.find((s) => !s.parentSpanId) || traceSpans.reduce((a, b) => (a.startTime < b.startTime ? a : b));
    const totalDuration = Math.max(...traceSpans.map((s) => s.durationMs));
    const hasError = traceSpans.some((s) => s.status === 'error');
    return {
      traceId,
      rootName: root.name,
      spanCount: traceSpans.length,
      durationMs: totalDuration,
      hasError,
      startTime: root.startTime,
    };
  });

  traces.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  res.json(traces.slice(0, 100));
});

// GET /project/:id/traces/:traceId — every span in a trace, for a waterfall view.
router.get('/project/:id/traces/:traceId', authMiddleware, async (req, res) => {
  const access = await requireProjectAccess(req.user.id, req.params.id, 'MEMBER');
  if (!access) return res.status(403).json({ error: 'Forbidden' });

  const spans = await prisma.traceSpan.findMany({
    where: { projectId: req.params.id, traceId: req.params.traceId },
    orderBy: { startTime: 'asc' },
  });
  if (!spans.length) return res.status(404).json({ error: 'Trace not found' });

  res.json(spans);
});

module.exports = router;
