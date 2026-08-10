const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");

const authRoutes = require("./routes/authRoutes");
const projectRoutes = require("./routes/projectRoutes");
const deploymentRoutes = require("./routes/deploymentRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const githubRoutes = require("./routes/githubRoutes");
const gitlabRoutes = require("./routes/gitlabRoutes");
const bitbucketRoutes = require("./routes/bitbucketRoutes");

const aiRoutes = require("./routes/aiRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const orgRoutes = require("./routes/orgRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const searchRoutes = require("./routes/searchRoutes");
const featureFlagRoutes = require("./routes/featureFlagRoutes");
const integrationsRoutes = require("./routes/integrationsRoutes");
const projectMemberRoutes = require("./routes/projectMemberRoutes");
const envGroupRoutes = require("./routes/envGroupRoutes");
const samlRoutes = require("./routes/samlRoutes");
const experimentRoutes = require("./routes/experimentRoutes");
const storageAddonRoutes = require("./routes/storageAddonRoutes");
const traceRoutes = require("./routes/traceRoutes");

const app = express();

// ── Static assets (tracking script, etc.) ─────────────────────────────────────
app.use('/static', express.static(path.join(__dirname, '../../public'), {
  maxAge: '1h',
  immutable: false,
}));

// ── Health check (before auth/rate-limit middleware) ──────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Security headers (no external dependency needed)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "0");
  next();
});

app.use(express.json({
  limit: "2mb",
  verify: (req, res, buf) => { req.rawBody = buf; },
}));
app.use(cors({
  origin: process.env.NEXTAUTH_URL || "http://localhost:3000",
  credentials: true,
}));
app.use(cookieParser());

app.use("/", authRoutes);
app.use("/", projectRoutes);
app.use("/", deploymentRoutes);
app.use("/", analyticsRoutes);
app.use("/", aiRoutes);
app.use("/", paymentRoutes);
app.use("/github", githubRoutes);
app.use("/gitlab", gitlabRoutes);
app.use("/bitbucket", bitbucketRoutes);
app.use("/", dashboardRoutes);
app.use("/", orgRoutes);
app.use("/", notificationRoutes);
app.use("/", searchRoutes);
app.use("/", featureFlagRoutes);
app.use("/", integrationsRoutes);
app.use("/", projectMemberRoutes);
app.use("/", envGroupRoutes);
app.use("/", samlRoutes);
app.use("/", experimentRoutes);
app.use("/", storageAddonRoutes);
app.use("/", traceRoutes);

const metricsRoutes = require("./routes/metricsRoutes");
app.use("/", metricsRoutes);

const { totpRouter } = require("./routes/totpRoutes");
app.use("/", totpRouter);

const hookRoutes = require("./routes/hookRoutes");
app.use("/hooks", hookRoutes);

const { cronRouter } = require("./routes/cronRoutes");
app.use("/", cronRouter);

const tunnelRoutes = require("./routes/tunnelRoutes");
app.use("/", tunnelRoutes);

const domainRoutes = require("./routes/domainRoutes");
app.use("/", domainRoutes);

const edgeFunctionRoutes = require("./routes/edgeFunctionRoutes");
app.use("/", edgeFunctionRoutes);

const alertRuleRoutes = require("./routes/alertRuleRoutes");
app.use("/", alertRuleRoutes);

const logRetentionRoutes = require("./routes/logRetentionRoutes");
app.use("/", logRetentionRoutes);

const ipAllowlistRoutes = require("./routes/ipAllowlistRoutes");
app.use("/", ipAllowlistRoutes);

const buildCacheRoutes = require("./routes/buildCacheRoutes");
app.use("/", buildCacheRoutes);

const secretScanRoutes = require("./routes/secretScanRoutes");
app.use("/", secretScanRoutes);

const monorepoRoutes = require("./routes/monorepoRoutes");
app.use("/", monorepoRoutes);

const encryptionRoutes = require("./routes/encryptionRoutes");
app.use("/", encryptionRoutes);

const dbBranchingRoutes = require("./routes/dbBranchingRoutes");
app.use("/", dbBranchingRoutes);

// Sentry error handler must be last, after all routes
if (process.env.SENTRY_DSN) {
  try {
    const Sentry = require('@sentry/node');
    app.use(Sentry.Handlers.errorHandler());
  } catch { /* Sentry not installed */ }
}

// Generic error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

module.exports = app;
