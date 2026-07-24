const express = require('express');
const crypto = require('crypto');
const { prisma } = require('../../lib/prisma');
const { getIO } = require('../utils/socket');
const { decrypt, encrypt } = require('../../lib/crypto');
const { ecsClient, CLUSTER, TASK, SUBNETS, SECURITY_GROUP, LAMBDA_EXECUTION_ROLE_ARN, RunTaskCommand } = require('../services/awsService');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { listUserRepos, getPackageJson, detectFramework, detectMonorepo, validateGitHubToken } = require('../services/githubService');

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

function slugifyBranch(branch) {
  return branch.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function triggerECSBuild({ project, branch, commitHash, trigger }) {
  const isPreview = branch !== 'main' && branch !== 'master';
  let previewSubdomain = null;

  if (isPreview) {
    const branchSlug = slugifyBranch(branch);
    previewSubdomain = `${project.slug}-${branchSlug}`.slice(0, 63);
    // Clear any old deployment that owned this subdomain
    await prisma.deployment.updateMany({
      where: { projectId: project.id, previewSubdomain },
      data: { previewSubdomain: null },
    });
  }

  const deployment = await prisma.deployment.create({
    data: {
      projectId: project.id,
      status: 'QUEUED',
      isActive: false,
      branch,
      commitHash: commitHash || null,
      trigger,
      startedAt: new Date(),
      isPreview,
      previewSubdomain,
    },
  });

  const targetEnv = isPreview ? 'preview' : 'production';
  const userEnvVarsObj = {};
  for (const e of project.environmentVariables ?? []) {
    if (e.environment === 'all' || e.environment === targetEnv) {
      userEnvVarsObj[e.key] = decrypt(e.value);
    }
  }

  const command = new RunTaskCommand({
    cluster: CLUSTER,
    taskDefinition: TASK,
    launchType: 'FARGATE',
    networkConfiguration: {
      awsvpcConfiguration: {
        assignPublicIp: 'ENABLED',
        subnets: SUBNETS,
        securityGroups: [SECURITY_GROUP],
      },
    },
    overrides: {
      containerOverrides: [
        {
          name: 'builder-image',
          environment: [
            { name: 'GIT_REPOSITORY_URL',  value: project.gitURL },
            { name: 'PROJECT_ID',          value: project.id },
            { name: 'DEPLOYEMENT_ID',      value: deployment.id },
            { name: 'BRANCH',              value: branch },
            { name: 'USER_ENV_VARS',       value: JSON.stringify(userEnvVarsObj) },
            { name: 'AWS_LAMBDA_ROLE_ARN', value: LAMBDA_EXECUTION_ROLE_ARN },
            { name: 'BUILD_COMMAND',       value: project.buildCommand   || 'npm run build' },
            { name: 'OUTPUT_DIR',          value: project.outputDir      || 'dist' },
            { name: 'INSTALL_COMMAND',     value: project.installCommand || 'npm install' },
            { name: 'ROOT_DIR',            value: project.rootDir        || '.' },
          ],
        },
      ],
    },
  });

  try {
    const result = await ecsClient.send(command);
    const taskArn = result.tasks?.[0]?.taskArn;
    if (taskArn) {
      await prisma.deployment.update({ where: { id: deployment.id }, data: { taskArn } });
    }
  } catch (ecsErr) {
    console.error('[Webhook] ECS task failed:', ecsErr);
    await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'FAILED' } });
  }

  return deployment;
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
    console.error('[GitHub] POST /github/token error:', err);
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
    console.error('[GitHub] DELETE /github/token error:', err);
    return res.status(500).json({ error: 'Failed to remove GitHub token' });
  }
});

/**
 * GET /github/repos
 * List GitHub repositories accessible with the user's stored PAT.
 */
router.get('/github/repos', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { githubToken: true },
    });

    if (!user || !user.githubToken) {
      return res.status(400).json({ error: 'No GitHub token configured' });
    }

    const decryptedToken = decrypt(user.githubToken);
    const repos = await listUserRepos(decryptedToken);

    return res.json({ repos });
  } catch (err) {
    console.error('[GitHub] GET /github/repos error:', err);
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
      select: { githubToken: true },
    });

    if (!user || !user.githubToken) {
      return res.status(400).json({ error: 'No GitHub token configured' });
    }

    const decryptedToken = decrypt(user.githubToken);
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
    console.error('[GitHub] GET /github/detect error:', err);
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
    const repoUrl = payload.repository?.html_url;
    if (!repoUrl) return res.sendStatus(200);

    const project = await prisma.project.findFirst({
      where: { gitURL: repoUrl },
      include: { environmentVariables: true },
    });

    if (!project) return res.sendStatus(200);

    // ── PUSH event — deploy all branches (main → production, others → preview) ─
    if (payload.ref) {
      const branch = payload.ref.replace("refs/heads/", "");
      const commitHash = payload.head_commit?.id;
      const isDefaultBranch = branch === 'main' || branch === 'master';

      // Validate branch name to prevent shell injection
      if (!/^[a-zA-Z0-9._\-/]+$/.test(branch)) {
        console.warn(`[Webhook Push] Rejecting invalid branch: ${branch}`);
        return res.sendStatus(200);
      }

      // For the default branch, avoid stacking production builds
      if (isDefaultBranch) {
        const inFlight = await prisma.deployment.findFirst({
          where: { projectId: project.id, status: { in: ['QUEUED', 'BUILDING'] }, isPreview: false },
        });
        if (inFlight) {
          console.log(`[Webhook] Push skipped — production build already in progress for ${project.name}`);
          return res.sendStatus(200);
        }
      }

      await triggerECSBuild({ project, branch, commitHash, trigger: 'GH_PUSH' });
      console.log(`[Webhook] Push → ${isDefaultBranch ? 'production' : 'preview'} deploy triggered for ${project.name} (${branch})`);

      // Emit socket event so the dashboard can show the new preview deployment immediately
      if (!isDefaultBranch) {
        getIO().to(`user:${project.userId}`).emit("github_branch_deployed", {
          projectId: project.id,
          projectName: project.name,
          branch,
        });
      }

      return res.sendStatus(200);
    }

    // ── PULL REQUEST event — preview deployment ──────────────────────────────
    if (payload.action === "opened" || payload.action === "synchronize") {
      const pr = payload.pull_request;
      if (!pr) return res.sendStatus(200);

      const branch = pr.head.ref;
      if (!/^[a-zA-Z0-9._\-/]+$/.test(branch)) {
        console.warn(`[Webhook PR] Rejecting invalid branch: ${branch}`);
        return res.sendStatus(200);
      }

      const deployment = await triggerECSBuild({
        project,
        branch,
        commitHash: pr.head.sha,
        trigger: 'WEBHOOK',
      });

      console.log(
        `[Webhook PR] Preview deploy triggered for ${project.name} ` +
        `(branch: ${branch}, deployment: ${deployment.id})\n` +
        `  Track: ${FRONTEND_URL}/dashboard/projects/${project.id}/deployments`
      );

      return res.sendStatus(200);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: "Webhook failed" });
  }
});

module.exports = router;