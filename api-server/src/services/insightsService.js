const { prisma } = require('../../lib/prisma');

async function generateInsights(projectId, deploymentId) {
  // Fetch last 10 DeploymentSignal records for this project's deployments
  const recentDeploymentIds = await prisma.deployment.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, status: true },
  });

  const deploymentIdList = recentDeploymentIds.map((d) => d.id);

  const signals = await prisma.deploymentSignal.findMany({
    where: { deploymentId: { in: deploymentIdList } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  // Isolate the signal for the current deployment
  const currentSignal = signals.find((s) => s.deploymentId === deploymentId) || signals[0] || null;

  const recommendations = [];

  if (!currentSignal) {
    return recommendations;
  }

  // ── SLOW_BUILD ───────────────────────────────────────────────────────────────
  if (currentSignal.buildTimeMs && currentSignal.buildTimeMs > 300000) {
    recommendations.push({
      ruleCode: 'SLOW_BUILD',
      title: 'Build time exceeds 5 minutes',
      explanation: `Your build took ${Math.round(currentSignal.buildTimeMs / 1000)}s. Builds over 5 minutes slow down your deploy loop.`,
      recommendation:
        'Enable build caching for node_modules. Check for unnecessary build steps or large assets being processed at build time.',
      severity: 'high',
      impact: 'performance',
      confidence: 0.95,
    });
  }

  // ── INCREASING_BUILD_TIME ────────────────────────────────────────────────────
  // Collect build times from signals in chronological order (oldest to newest)
  const signalsWithBuildTime = signals
    .filter((s) => s.buildTimeMs != null)
    .slice(0, 10)
    .reverse(); // oldest first

  if (signalsWithBuildTime.length >= 3) {
    const last3 = signalsWithBuildTime.slice(-3);
    const [t1, t2, t3] = last3.map((s) => s.buildTimeMs);
    const grows = t2 > t1 * 1.2 && t3 > t2 * 1.2;
    if (grows) {
      recommendations.push({
        ruleCode: 'INCREASING_BUILD_TIME',
        title: 'Build time is consistently growing',
        explanation: `Your last 3 builds took progressively longer (${Math.round(t1 / 1000)}s → ${Math.round(t2 / 1000)}s → ${Math.round(t3 / 1000)}s). This trend usually means growing dependency count or larger input files.`,
        recommendation:
          'Audit recently added dependencies. Consider code splitting or lazy imports.',
        severity: 'medium',
        impact: 'performance',
        confidence: 0.80,
      });
    }
  }

  // ── HIGH_DEPENDENCY_COUNT ────────────────────────────────────────────────────
  if (currentSignal.dependencyCount && currentSignal.dependencyCount > 150) {
    recommendations.push({
      ruleCode: 'HIGH_DEPENDENCY_COUNT',
      title: `High dependency count (${currentSignal.dependencyCount})`,
      explanation: `Projects with >150 dependencies have significantly slower cold installs.`,
      recommendation:
        'Audit dependencies with `npm-check` and remove unused packages. Consider moving dev tools to devDependencies.',
      severity: 'medium',
      impact: 'performance',
      confidence: 0.85,
    });
  }

  // ── Single-step regressions vs. the immediately preceding deployment ─────────
  // Distinct from INCREASING_BUILD_TIME (a 3-build trend) — this catches a
  // regression introduced by just the last change, the more common case.
  const currentIndex = recentDeploymentIds.findIndex((d) => d.id === deploymentId);
  const previousDeploymentId = currentIndex >= 0 ? recentDeploymentIds[currentIndex + 1]?.id : null;
  const previousSignal = previousDeploymentId ? signals.find((s) => s.deploymentId === previousDeploymentId) : null;

  if (previousSignal?.buildTimeMs && currentSignal.buildTimeMs && currentSignal.buildTimeMs > previousSignal.buildTimeMs * 1.5) {
    const pctChange = Math.round((currentSignal.buildTimeMs / previousSignal.buildTimeMs - 1) * 100);
    recommendations.push({
      ruleCode: 'BUILD_TIME_REGRESSION',
      title: `Build time regressed ${pctChange}% vs. the previous deployment`,
      explanation: `This build took ${Math.round(currentSignal.buildTimeMs / 1000)}s, up from ${Math.round(previousSignal.buildTimeMs / 1000)}s on the last deployment.`,
      recommendation:
        'Check what changed in this push — a new dependency, a build config change, or a larger input file are the usual causes.',
      severity: 'high',
      impact: 'performance',
      confidence: 0.85,
    });
  }

  // ── BUNDLE_SIZE_REGRESSION ─────────────────────────────────────────────────
  if (previousSignal?.bundleSizeBytes && currentSignal.bundleSizeBytes && currentSignal.bundleSizeBytes > previousSignal.bundleSizeBytes * 1.2) {
    const pctChange = Math.round((currentSignal.bundleSizeBytes / previousSignal.bundleSizeBytes - 1) * 100);
    const fmt = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)}MB`;
    recommendations.push({
      ruleCode: 'BUNDLE_SIZE_REGRESSION',
      title: `Bundle size grew ${pctChange}% vs. the previous deployment`,
      explanation: `Output size went from ${fmt(previousSignal.bundleSizeBytes)} to ${fmt(currentSignal.bundleSizeBytes)}.`,
      recommendation:
        'Check for a newly added large dependency or asset. Consider dynamic imports/code splitting, or moving large assets to an external CDN.',
      severity: 'medium',
      impact: 'performance',
      confidence: 0.8,
    });
  }

  // ── FREQUENT_FAILURES ────────────────────────────────────────────────────────
  const total = recentDeploymentIds.length;
  if (total > 0) {
    const failCount = recentDeploymentIds.filter((d) => d.status === 'FAILED').length;
    const pct = Math.round((failCount / total) * 100);
    if (pct > 40) {
      recommendations.push({
        ruleCode: 'FREQUENT_FAILURES',
        title: `High failure rate — ${pct}% of recent builds failed`,
        explanation: `${failCount} of your last ${total} deployments failed.`,
        recommendation:
          'Check your build logs for recurring errors. Ensure your build command works locally with `npm run build` before pushing.',
        severity: 'high',
        impact: 'stability',
        confidence: 0.95,
      });
    }
  }

  // ── NO_LOCKFILE (slow install proxy) ─────────────────────────────────────────
  if (
    currentSignal.dependencyCount &&
    currentSignal.dependencyCount > 0 &&
    currentSignal.installTimeMs &&
    currentSignal.installTimeMs > 60000
  ) {
    recommendations.push({
      ruleCode: 'NO_LOCKFILE',
      title: 'Slow dependency install',
      explanation: `Installing dependencies took ${Math.round(currentSignal.installTimeMs / 1000)}s.`,
      recommendation:
        'Use `npm ci` instead of `npm install` for faster, reproducible installs. Make sure package-lock.json is committed.',
      severity: 'medium',
      impact: 'performance',
      confidence: 0.75,
    });
  }

  // ── Persist recommendations ──────────────────────────────────────────────────
  for (const rec of recommendations) {
    await prisma.deploymentRecommendation.upsert({
      where: {
        deploymentId_ruleCode: { deploymentId, ruleCode: rec.ruleCode },
      },
      create: { deploymentId, ...rec },
      update: { ...rec },
    });
  }

  return recommendations;
}

module.exports = { generateInsights };