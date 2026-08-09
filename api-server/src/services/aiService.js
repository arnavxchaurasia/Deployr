const { prisma } = require("../../lib/prisma");
const logger = require("../../lib/logger");

async function processTelemetry(projectId, deploymentId, telemetry) {
  try {
    logger.info(`[Build Checks] Analyzing telemetry for deployment ${deploymentId}...`);
    
    const { dependencies, devDependencies, totalBuildTimeMs, isNextJs, bundleSizeBytes, vulnerabilities } = telemetry;
    const allDeps = { ...dependencies, ...devDependencies };
    const recommendations = [];

    // ----------------------------------------------------
    // Known dependency vulnerabilities (OSV.dev — see vulnScanner.js)
    // ----------------------------------------------------
    for (const v of vulnerabilities || []) {
      recommendations.push({
        ruleCode: `VULN_${v.id}`,
        title: `Known vulnerability in ${v.name}@${v.version}`,
        explanation: v.summary,
        recommendation: `Upgrade ${v.name} to a patched version. See https://osv.dev/vulnerability/${v.id} for details.`,
        severity: 'high',
        impact: 'security',
        confidence: 0.9,
      });
    }

    // Merge dependency count / bundle size onto this deployment's
    // DeploymentSignal row (buildTimeMs is written separately, from the
    // "build complete" log match in kafkaService.js — whichever write lands
    // first, the other updates the same row rather than creating a second
    // one, so insightsService.js's "most recent signal for this deployment"
    // lookup always sees the full picture).
    const dependencyCount = Object.keys(allDeps).length;
    const existingSignal = await prisma.deploymentSignal.findFirst({
      where: { deploymentId },
      orderBy: { createdAt: 'desc' },
    });
    if (existingSignal) {
      await prisma.deploymentSignal.update({
        where: { id: existingSignal.id },
        data: { dependencyCount, bundleSizeBytes },
      });
    } else {
      await prisma.deploymentSignal.create({
        data: { deploymentId, dependencyCount, bundleSizeBytes },
      });
    }

    // ----------------------------------------------------
    // RULE 1: React Version Upgrade (Performance / Concurrent Mode)
    // ----------------------------------------------------
    if (allDeps["react"]) {
      const version = allDeps["react"].replace(/[^0-9.]/g, "");
      const major = parseInt(version.split(".")[0]);
      if (major < 18) {
        recommendations.push({
          ruleCode: "REACT_CONCURRENT",
          title: "Upgrade to React 18+",
          explanation: `You are using React ${major}. React 18 introduces Concurrent Features and Automatic Batching which drastically improves UI rendering performance.`,
          recommendation: "Run `npm install react@latest react-dom@latest` to upgrade.",
          severity: "medium",
          impact: "performance",
          confidence: 0.95
        });
      }
    }

    // ----------------------------------------------------
    // RULE 2: Slow Build Times (Bundle Bloat / Package Manager)
    // ----------------------------------------------------
    if (totalBuildTimeMs > 60000) { // > 60s
      recommendations.push({
        ruleCode: "SLOW_BUILD",
        title: "Optimize Build & Install Times",
        explanation: `Your build took ${Math.round(totalBuildTimeMs / 1000)}s. Long build times usually mean massive node_modules or unoptimized bundlers.`,
        recommendation: "Use `pnpm` or `npm ci` for faster installs. If using Webpack, consider switching to Vite or Turbopack for near-instant HMR and faster builds.",
        severity: "high",
        impact: "productivity",
        confidence: 0.85
      });
    }

    // ----------------------------------------------------
    // RULE 3: Next.js Cache Optimization
    // ----------------------------------------------------
    if (isNextJs && allDeps["next"]) {
      const version = allDeps["next"].replace(/[^0-9.]/g, "");
      const major = parseInt(version.split(".")[0]);
      if (major < 13) {
        recommendations.push({
          ruleCode: "NEXT_APP_ROUTER",
          title: "Adopt Next.js App Router",
          explanation: `You are using Next.js ${major}. Next.js 13+ with App Router provides React Server Components, cutting your client-side JS bundle size by up to 80%.`,
          recommendation: "Migrate from the `pages/` directory to the `app/` directory and leverage Server Components.",
          severity: "high",
          impact: "performance",
          confidence: 0.90
        });
      }
    }

    // ----------------------------------------------------
    // RULE 4: Heavy Dependencies (Lodash vs Lodash-es)
    // ----------------------------------------------------
    if (allDeps["lodash"] && !allDeps["lodash-es"]) {
      recommendations.push({
        ruleCode: "LODASH_BLOAT",
        title: "Replace lodash with lodash-es",
        explanation: "Standard `lodash` is notoriously bad at tree-shaking and can bloat your production bundle significantly.",
        recommendation: "Uninstall `lodash` and install `lodash-es` instead, or just use native ES6 array/object methods.",
        severity: "low",
        impact: "performance",
        confidence: 0.98
      });
    }

    // ----------------------------------------------------
    // Save to Database
    // ----------------------------------------------------
    if (recommendations.length > 0) {
      const data = recommendations.map(rec => ({
        deploymentId,
        ruleCode: rec.ruleCode,
        title: rec.title,
        explanation: rec.explanation,
        recommendation: rec.recommendation,
        severity: rec.severity,
        impact: rec.impact,
        confidence: rec.confidence,
        applied: false
      }));

      await prisma.deploymentRecommendation.createMany({ data, skipDuplicates: true });
      logger.info(`[AI Engine] Saved ${recommendations.length} insights for ${deploymentId}`);
    }

  } catch (err) {
    logger.error({ err }, "[AI Engine] Evaluation failed");
  }
}

module.exports = {
  processTelemetry
};
