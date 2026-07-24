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
    try {
      await prisma.deploymentRecommendation.upsert({
        where: {
          deploymentId_ruleCode: { deploymentId, ruleCode: rec.ruleCode },
        },
        create: { deploymentId, ...rec },
        update: { ...rec },
      });
    } catch (upsertErr) {
      // Composite unique may not be migrated yet — fall back to createMany with skipDuplicates
      if (upsertErr.code === 'P2025' || upsertErr.code === 'P2002' || upsertErr.message?.includes('unique')) {
        await prisma.deploymentRecommendation.createMany({
          data: recommendations.map((r) => ({ deploymentId, ...r })),
          skipDuplicates: true,
        });
        break;
      }
      throw upsertErr;
    }
  }

  return recommendations;
}

module.exports = { generateInsights };