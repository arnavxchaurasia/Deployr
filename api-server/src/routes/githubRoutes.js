const express = require('express');
const crypto = require('crypto');
const { prisma } = require('../../lib/prisma');
const logger = require('../../lib/logger');
const { getIO } = require('../utils/socket');
const { encrypt } = require('../../lib/crypto');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { listUserRepos, listInstallationRepos, getPackageJson, detectFramework, detectMonorepo, validateGitHubToken } = require('../services/githubService');
const { checkBuildQuota } = require('../services/quotaService');
const { checkBlackout } = require('../services/blackoutService');
const { triggerECSBuild } = require('../services/deployTriggerService');
const { cleanupDeployment } = require('../services/deploymentCleanupService');
const { isConfigured: isGithubAppConfigured, installUrl, resolveGithubToken, resolveGithubAuth } = require('../services/githubAppService');
const { setCommitStatus } = require('../services/githubService');

// Fallback for projects created before githubOwner/githubRepo were persisted at creation time.
function resolveGithubOwnerRepo(project) {
  if (project?.githubOwner && project?.githubRepo) {
    return { owner: project.githubOwner, repo: project.githubRepo };
  }
  const match = project?.gitURL?.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/i);
  return match ? { owner: match[1], repo: match[2] } : { owner: null, repo: null };
}

// Fire-and-forget commit status update — never blocks the webhook response,
// and silently no-ops if there's no commit hash or resolvable GitHub auth.
async function notifyCommitStatus(project, commitHash, state, { targetUrl, description } = {}) {
  if (!commitHash) return;
  const { owner, repo } = resolveGithubOwnerRepo(project);
  if (!owner || !repo || !project.user) return;

  const token = await resolveGithubToken(project.user);
  if (!token) return;

  setCommitStatus(owner, repo, commitHash, state, { targetUrl, description, context: 'deployr/deploy' }, token)
    .catch(() => {});
}

const router = express.Router();

const FRONTEND_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

function verifyGithubSignature(req) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return false;
  const sig = req.headers["x-hub-signature-256"];
  if (!sig) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(req.rawBody || JSON.stringify(req.body)).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── GitHub token management ──────────────────────────────────────────────────

/**
 * POST /github/token
 * Save (or replace) the authenticated user's GitHub Personal Access Token.
 * Body: { token: string }
 */
router.post('/github/token', authMiddleware, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string' || token.trim() === '') {
      return res.status(400).json({ error: 'Token is required' });
    }

    const { valid, login } = await validateGitHubToken(token.trim());
    if (!valid) {
      return res.status(400).json({ error: 'Invalid GitHub token' });
    }

    const encrypted = encrypt(token.trim());

    await prisma.user.update({
      where: { id: req.user.id },
      data: { githubToken: encrypted },
    });

    return res.json({ success: true, login });
  } catch (err) {
    logger.error({ err }, '[GitHub] POST /github/token error');
    return res.status(500).json({ error: 'Failed to save GitHub token' });
  }
});

/**
 * DELETE /github/token
 * Remove the authenticated user's stored GitHub PAT.
 */
router.delete('/github/token', authMiddleware, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { githubToken: null },
    });

    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, '[GitHub] DELETE /github/token error');
    return res.status(500).json({ error: 'Failed to remove GitHub token' });
  }
});

/**
 * GET /github/app/status
 * Whether the GitHub App is available to connect, and whether this user
 * already has. Frontend uses this to offer "Connect via GitHub App" as an
 * alternative to pasting a PAT.
 */
router.get('/github/app/status', authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { githubAppInstallationId: true },
  });

  res.json({
    available: isGithubAppConfigured(),
    installed: !!user?.githubAppInstallationId,
    installUrl: installUrl(),
  });
});

/**
 * GET /github/repos
 * List GitHub repositories accessible with the user's stored PAT.
 */
router.get('/github/repos', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { githubToken: true, githubAppInstallationId: true },
    });

    const auth = await resolveGithubAuth(user);
    if (!auth) {
      return res.status(400).json({ error: 'No GitHub token or App installation configured' });
    }

    const repos = auth.isAppInstallation
      ? await listInstallationRepos(auth.token)
      : await listUserRepos(auth.token);

    return res.json({ repos });
  } catch (err) {
    logger.error({ err }, '[GitHub] GET /github/repos error');
    return res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

/**
 * GET /github/detect
 * Detect framework from a repo's package.json.
 * Query params: ?owner=&repo=&branch=
 */
router.get('/github/detect', authMiddleware, async (req, res) => {
  try {
    const { owner, repo, branch } = req.query;

    if (!owner || !repo) {
      return res.status(400).json({ error: 'owner and repo query params are required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { githubToken: true, githubAppInstallationId: true },
    });

    const decryptedToken = await resolveGithubToken(user);
    if (!decryptedToken) {
      return res.status(400).json({ error: 'No GitHub token or App installation configured' });
    }

    const resolvedBranch = branch || 'main';

    const [pkg, monorepo] = await Promise.all([
      getPackageJson(owner, repo, resolvedBranch, decryptedToken),
      detectMonorepo(owner, repo, decryptedToken, resolvedBranch),
    ]);

    if (!pkg) {
      return res.json({ detected: false, isMonorepo: monorepo.isMonorepo, monoRepoType: monorepo.type });
    }

    const { framework, buildCommand, outputDir, installCommand } = detectFramework(pkg);

    return res.json({ detected: true, framework, buildCommand, outputDir, installCommand, isMonorepo: monorepo.isMonorepo, monoRepoType: monorepo.type });
  } catch (err) {
    logger.error({ err }, '[GitHub] GET /github/detect error');
    return res.status(500).json({ error: 'Failed to detect framework' });
  }
});

// ── GitHub webhook ───────────────────────────────────────────────────────────

router.post("/webhook", async (req, res) => {
  try {
    if (!verifyGithubSignature(req)) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    const payload = req.body;

    // ── GitHub App installation events (account-level, no `repository`) ──────
    if (payload.installation && ['created', 'deleted', 'new_permissions_accepted'].includes(payload.action)) {
      const installationId = payload.installation.id;
      const accountLogin = payload.installation.account?.login;

      if (payload.action === 'deleted') {
        await prisma.user.updateMany({
          where: { githubAppInstallationId: installationId },
          data: { githubAppInstallationId: null },
        });
        logger.info(`[GitHub App] Installation ${installationId} removed`);
      } else if (accountLogin) {
        const updated = await prisma.user.updateMany({
          where: { githubUsername: { equals: accountLogin, mode: 'insensitive' } },
          data: { githubAppInstallationId: installationId },
        });
        logger.info(`[GitHub App] Installation ${installationId} linked to ${updated.count} user(s) matching "${accountLogin}"`);
      }

      return res.sendStatus(200);
    }

    const repoUrl = payload.repository?.html_url;
    if (!repoUrl) return res.sendStatus(200);

    // A monorepo can back multiple Deployr projects (same gitURL, different
    // rootDir/build config per app) — deploy all of them, not just the first.
    const projects = await prisma.project.findMany({
      where: { gitURL: repoUrl },
      include: {
        environmentVariables: true,
        user: { select: { githubToken: true, githubAppInstallationId: true } },
      },
    });

    if (projects.length === 0) return res.sendStatus(200);

    // ── PUSH event — deploy all branches (main → production, others → preview) ─
    if (payload.ref) {
      const branch = payload.ref.replace("refs/heads/", "");
      const commitHash = payload.head_commit?.id;
      const isDefaultBranch = branch === 'main' || branch === 'master';

      // Validate branch name to prevent shell injection
      if (!/^[a-zA-Z0-9._\-/]+$/.test(branch)) {
        logger.warn(`[Webhook Push] Rejecting invalid branch: ${branch}`);
        return res.sendStatus(200);
      }

      for (const project of projects) {
        // For the default branch, avoid stacking production builds
        if (isDefaultBranch) {
          const inFlight = await prisma.deployment.findFirst({
            where: { projectId: project.id, status: { in: ['QUEUED', 'BUILDING'] }, isPreview: false },
          });
          if (inFlight) {
            logger.info(`[Webhook] Push skipped — production build already in progress for ${project.name}`);
            continue;
          }
        }

        const quota = await checkBuildQuota({ userId: project.userId, orgId: project.orgId });
        if (!quota.allowed) {
          logger.info(`[Webhook] Push skipped — build-minute quota exceeded for ${project.name} (${quota.used.toFixed(1)}/${quota.limit} min)`);
          continue;
        }

        const blackout = checkBlackout(project);
        if (blackout.blocked) {
          logger.info(`[Webhook] Push skipped — blackout window active for ${project.name}`);
          continue;
        }

        const pushDeployment = await triggerECSBuild({ project, branch, commitHash, trigger: 'GH_PUSH' });
        logger.info(`[Webhook] Push → ${isDefaultBranch ? 'production' : 'preview'} deploy triggered for ${project.name} (${branch})`);
        notifyCommitStatus(project, commitHash, 'pending', {
          targetUrl: `${FRONTEND_URL}/dashboard/logs/${pushDeployment.id}`,
          description: 'Deployr build in progress',
        });

        // Emit socket event so the dashboard can show the new preview deployment immediately
        if (!isDefaultBranch) {
          getIO().to(`user:${project.userId}`).emit("github_branch_deployed", {
            projectId: project.id,
            projectName: project.name,
            branch,
          });
        }
      }

      return res.sendStatus(200);
    }

    // ── PULL REQUEST event — preview deployment ──────────────────────────────
    if (payload.action === "opened" || payload.action === "synchronize") {
      const pr = payload.pull_request;
      if (!pr) return res.sendStatus(200);

      const branch = pr.head.ref;
      if (!/^[a-zA-Z0-9._\-/]+$/.test(branch)) {
        logger.warn(`[Webhook PR] Rejecting invalid branch: ${branch}`);
        return res.sendStatus(200);
      }

      for (const project of projects) {
        const quota = await checkBuildQuota({ userId: project.userId, orgId: project.orgId });
        if (!quota.allowed) {
          logger.info(`[Webhook PR] Skipped — build-minute quota exceeded for ${project.name} (${quota.used.toFixed(1)}/${quota.limit} min)`);
          continue;
        }

        const blackout = checkBlackout(project);
        if (blackout.blocked) {
          logger.info(`[Webhook PR] Skipped — blackout window active for ${project.name}`);
          continue;
        }

        const deployment = await triggerECSBuild({
          project,
          branch,
          commitHash: pr.head.sha,
          trigger: 'WEBHOOK',
          prNumber: pr.number,
        });

        logger.info(
          `[Webhook PR] Preview deploy triggered for ${project.name} ` +
          `(branch: ${branch}, deployment: ${deployment.id})\n` +
          `  Track: ${FRONTEND_URL}/dashboard/projects/${project.id}/deployments`
        );

        notifyCommitStatus(project, pr.head.sha, 'pending', {
          targetUrl: `${FRONTEND_URL}/dashboard/logs/${deployment.id}`,
          description: 'Deployr build in progress',
        });
      }

      return res.sendStatus(200);
    }

    // ── PULL REQUEST closed/merged — tear down its preview deployment(s) ─────
    if (payload.action === "closed") {
      const pr = payload.pull_request;
      if (!pr) return res.sendStatus(200);

      for (const project of projects) {
        const previews = await prisma.deployment.findMany({
          where: { projectId: project.id, prNumber: pr.number, isPreview: true },
        });
        for (const preview of previews) {
          try {
            await cleanupDeployment(preview);
            logger.info(`[Webhook PR] Preview deployment cleaned up for ${project.name} (PR #${pr.number})`);
          } catch (err) {
            logger.error({ err }, `[Webhook PR] Preview cleanup failed for ${preview.id}`);
          }
        }
      }

      return res.sendStatus(200);
    }

    res.sendStatus(200);
  } catch (err) {
    logger.error({ err }, "Webhook error");
    res.status(500).json({ error: "Webhook failed" });
  }
});

module.exports = router;