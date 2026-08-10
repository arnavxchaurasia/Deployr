'use strict';

const express = require('express');
const logger = require('../../lib/logger');
const { prisma } = require('../../lib/prisma');
const { getIO } = require('../utils/socket');
const { checkBuildQuota } = require('../services/quotaService');
const { checkBlackout } = require('../services/blackoutService');
const { triggerECSBuild } = require('../services/deployTriggerService');
const { cleanupDeployment } = require('../services/deploymentCleanupService');

const router = express.Router();

// GitLab webhooks authenticate with a plain shared-secret header rather than
// an HMAC signature (unlike GitHub's X-Hub-Signature-256).
function verifyGitlabToken(req) {
  const secret = process.env.GITLAB_WEBHOOK_SECRET;
  if (!secret) return false;
  const token = req.headers['x-gitlab-token'];
  if (!token) return false;
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(secret);
    return a.length === b.length && require('crypto').timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function normalizeRepoUrl(url) {
  return (url || '').replace(/\.git$/, '').replace(/\/$/, '').toLowerCase();
}

router.post('/webhook', async (req, res) => {
  try {
    if (!verifyGitlabToken(req)) {
      return res.status(401).json({ error: 'Invalid webhook token' });
    }

    const payload = req.body;
    const repoUrl = payload.project?.git_http_url || payload.project?.web_url;
    if (!repoUrl) return res.sendStatus(200);

    const candidates = [repoUrl, `${repoUrl}.git`];
    const normalized = normalizeRepoUrl(repoUrl);

    const allProjects = await prisma.project.findMany({
      where: { repoProvider: 'GITLAB' },
      include: { environmentVariables: true },
    });
    const projects = allProjects.filter((p) => normalizeRepoUrl(p.gitURL) === normalized || candidates.includes(p.gitURL));

    if (projects.length === 0) return res.sendStatus(200);

    // ── Push event ────────────────────────────────────────────────────────
    if (payload.object_kind === 'push') {
      const branch = (payload.ref || '').replace('refs/heads/', '');
      const commitHash = payload.after;
      const isDefaultBranch = branch === 'main' || branch === 'master';

      if (!/^[a-zA-Z0-9._\-/]+$/.test(branch)) {
        logger.warn(`[GitLab Webhook] Rejecting invalid branch: ${branch}`);
        return res.sendStatus(200);
      }

      for (const project of projects) {
        if (isDefaultBranch) {
          const inFlight = await prisma.deployment.findFirst({
            where: { projectId: project.id, status: { in: ['QUEUED', 'BUILDING'] }, isPreview: false },
          });
          if (inFlight) continue;
        }

        const quota = await checkBuildQuota({ userId: project.userId, orgId: project.orgId });
        if (!quota.allowed) {
          logger.info(`[GitLab Webhook] Skipped — build-minute quota exceeded for ${project.name}`);
          continue;
        }

        const blackout = checkBlackout(project);
        if (blackout.blocked) {
          logger.info(`[GitLab Webhook] Skipped — blackout window active for ${project.name}`);
          continue;
        }

        await triggerECSBuild({ project, branch, commitHash, trigger: 'GH_PUSH' });
        logger.info(`[GitLab Webhook] Push → ${isDefaultBranch ? 'production' : 'preview'} deploy triggered for ${project.name} (${branch})`);

        if (!isDefaultBranch) {
          getIO().to(`user:${project.userId}`).emit('github_branch_deployed', {
            projectId: project.id,
            projectName: project.name,
            branch,
          });
        }
      }

      return res.sendStatus(200);
    }

    // ── Tag push event — deploy on git tag ───────────────────────────────
    if (payload.object_kind === 'tag_push') {
      const tagName = (payload.ref || '').replace('refs/tags/', '');
      const commitHash = payload.after;

      if (!tagName || !/^[a-zA-Z0-9._\-/]+$/.test(tagName)) {
        logger.warn(`[GitLab Webhook] Rejecting invalid tag: ${tagName}`);
        return res.sendStatus(200);
      }

      for (const project of projects) {
        const quota = await checkBuildQuota({ userId: project.userId, orgId: project.orgId });
        if (!quota.allowed) {
          logger.info(`[GitLab Webhook] Tag push skipped — build-minute quota exceeded for ${project.name}`);
          continue;
        }

        const blackout = checkBlackout(project);
        if (blackout.blocked) {
          logger.info(`[GitLab Webhook] Tag push skipped — blackout window active for ${project.name}`);
          continue;
        }

        await triggerECSBuild({ project, branch: tagName, commitHash, trigger: 'GH_PUSH' });
        logger.info(`[GitLab Webhook] Tag push → deploy triggered for ${project.name} (tag: ${tagName})`);

        getIO().to(`user:${project.userId}`).emit('github_tag_deployed', {
          projectId: project.id,
          projectName: project.name,
          tag: tagName,
        });
      }

      return res.sendStatus(200);
    }

    // ── Merge request event → preview deployment ─────────────────────────
    if (payload.object_kind === 'merge_request') {
      const attrs = payload.object_attributes;
      if (!attrs) return res.sendStatus(200);

      // ── Closed/merged — tear down its preview deployment(s) ────────────
      if (['close', 'merge'].includes(attrs.action)) {
        for (const project of projects) {
          const previews = await prisma.deployment.findMany({
            where: { projectId: project.id, prNumber: attrs.iid, isPreview: true },
          });
          for (const preview of previews) {
            try {
              await cleanupDeployment(preview);
              logger.info(`[GitLab Webhook] Preview deployment cleaned up for ${project.name} (MR !${attrs.iid})`);
            } catch (err) {
              logger.error({ err }, `[GitLab Webhook] Preview cleanup failed for ${preview.id}`);
            }
          }
        }
        return res.sendStatus(200);
      }

      if (!['open', 'update', 'reopen'].includes(attrs.action)) {
        return res.sendStatus(200);
      }

      const branch = attrs.source_branch;
      if (!branch || !/^[a-zA-Z0-9._\-/]+$/.test(branch)) {
        logger.warn(`[GitLab Webhook] Rejecting invalid branch: ${branch}`);
        return res.sendStatus(200);
      }

      for (const project of projects) {
        const quota = await checkBuildQuota({ userId: project.userId, orgId: project.orgId });
        if (!quota.allowed) {
          logger.info(`[GitLab Webhook] MR skipped — build-minute quota exceeded for ${project.name}`);
          continue;
        }

        const blackout = checkBlackout(project);
        if (blackout.blocked) {
          logger.info(`[GitLab Webhook] MR skipped — blackout window active for ${project.name}`);
          continue;
        }

        const deployment = await triggerECSBuild({
          project,
          branch,
          commitHash: attrs.last_commit?.id,
          trigger: 'WEBHOOK',
          prNumber: attrs.iid,
        });

        logger.info(`[GitLab Webhook] MR preview deploy triggered for ${project.name} (branch: ${branch}, deployment: ${deployment.id})`);
      }

      return res.sendStatus(200);
    }

    res.sendStatus(200);
  } catch (err) {
    logger.error({ err }, 'GitLab webhook error');
    res.status(500).json({ error: 'Webhook failed' });
  }
});

module.exports = router;
