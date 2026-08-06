'use strict';

const express = require('express');
const logger = require('../../lib/logger');
const crypto = require('crypto');
const { prisma } = require('../../lib/prisma');
const { getIO } = require('../utils/socket');
const { checkBuildQuota } = require('../services/quotaService');
const { checkBlackout } = require('../services/blackoutService');
const { triggerECSBuild } = require('../services/deployTriggerService');
const { cleanupDeployment } = require('../services/deploymentCleanupService');

const router = express.Router();

// Bitbucket Cloud doesn't sign webhook payloads, so authentication is a
// shared secret passed as a query param when the webhook URL is configured
// (e.g. https://api.deployr.app/bitbucket/webhook?token=...).
function verifyBitbucketToken(req) {
  const secret = process.env.BITBUCKET_WEBHOOK_SECRET;
  if (!secret) return false;
  const token = req.query.token;
  if (!token || typeof token !== 'string') return false;
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(secret);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function normalizeRepoUrl(url) {
  return (url || '').replace(/\.git$/, '').replace(/\/$/, '').toLowerCase();
}

router.post('/webhook', async (req, res) => {
  try {
    if (!verifyBitbucketToken(req)) {
      return res.status(401).json({ error: 'Invalid webhook token' });
    }

    const eventKey = req.headers['x-event-key'];
    const payload = req.body;
    const repoUrl = payload.repository?.links?.html?.href;
    if (!repoUrl) return res.sendStatus(200);

    const normalized = normalizeRepoUrl(repoUrl);
    const allProjects = await prisma.project.findMany({
      where: { repoProvider: 'BITBUCKET' },
      include: { environmentVariables: true },
    });
    const projects = allProjects.filter((p) => normalizeRepoUrl(p.gitURL) === normalized);

    if (projects.length === 0) return res.sendStatus(200);

    // ── Push event ────────────────────────────────────────────────────────
    if (eventKey === 'repo:push') {
      const changes = payload.push?.changes || [];

      for (const change of changes) {
        const branch = change.new?.name;
        const commitHash = change.new?.target?.hash;
        if (!branch || !/^[a-zA-Z0-9._\-/]+$/.test(branch)) continue;

        const isDefaultBranch = branch === 'main' || branch === 'master';

        for (const project of projects) {
          if (isDefaultBranch) {
            const inFlight = await prisma.deployment.findFirst({
              where: { projectId: project.id, status: { in: ['QUEUED', 'BUILDING'] }, isPreview: false },
            });
            if (inFlight) continue;
          }

          const quota = await checkBuildQuota({ userId: project.userId, orgId: project.orgId });
          if (!quota.allowed) {
            logger.info(`[Bitbucket Webhook] Skipped — build-minute quota exceeded for ${project.name}`);
            continue;
          }

          const blackout = checkBlackout(project);
          if (blackout.blocked) {
            logger.info(`[Bitbucket Webhook] Skipped — blackout window active for ${project.name}`);
            continue;
          }

          await triggerECSBuild({ project, branch, commitHash, trigger: 'GH_PUSH' });
          logger.info(`[Bitbucket Webhook] Push → ${isDefaultBranch ? 'production' : 'preview'} deploy triggered for ${project.name} (${branch})`);

          if (!isDefaultBranch) {
            getIO().to(`user:${project.userId}`).emit('github_branch_deployed', {
              projectId: project.id,
              projectName: project.name,
              branch,
            });
          }
        }
      }

      return res.sendStatus(200);
    }

    // ── Pull request event → preview deployment ──────────────────────────
    if (eventKey === 'pullrequest:created' || eventKey === 'pullrequest:updated') {
      const pr = payload.pullrequest;
      const branch = pr?.source?.branch?.name;
      if (!branch || !/^[a-zA-Z0-9._\-/]+$/.test(branch)) return res.sendStatus(200);

      for (const project of projects) {
        const quota = await checkBuildQuota({ userId: project.userId, orgId: project.orgId });
        if (!quota.allowed) {
          logger.info(`[Bitbucket Webhook] PR skipped — build-minute quota exceeded for ${project.name}`);
          continue;
        }

        const blackout = checkBlackout(project);
        if (blackout.blocked) {
          logger.info(`[Bitbucket Webhook] PR skipped — blackout window active for ${project.name}`);
          continue;
        }

        const deployment = await triggerECSBuild({
          project,
          branch,
          commitHash: pr.source?.commit?.hash,
          trigger: 'WEBHOOK',
          prNumber: pr.id,
        });

        logger.info(`[Bitbucket Webhook] PR preview deploy triggered for ${project.name} (branch: ${branch}, deployment: ${deployment.id})`);
      }

      return res.sendStatus(200);
    }

    // ── PR merged/declined — tear down its preview deployment(s) ─────────
    if (eventKey === 'pullrequest:fulfilled' || eventKey === 'pullrequest:rejected') {
      const pr = payload.pullrequest;
      if (!pr) return res.sendStatus(200);

      for (const project of projects) {
        const previews = await prisma.deployment.findMany({
          where: { projectId: project.id, prNumber: pr.id, isPreview: true },
        });
        for (const preview of previews) {
          try {
            await cleanupDeployment(preview);
            logger.info(`[Bitbucket Webhook] Preview deployment cleaned up for ${project.name} (PR #${pr.id})`);
          } catch (err) {
            logger.error({ err }, `[Bitbucket Webhook] Preview cleanup failed for ${preview.id}`);
          }
        }
      }

      return res.sendStatus(200);
    }

    res.sendStatus(200);
  } catch (err) {
    logger.error({ err }, 'Bitbucket webhook error');
    res.status(500).json({ error: 'Webhook failed' });
  }
});

module.exports = router;
