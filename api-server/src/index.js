require("dotenv").config();

// ── Sentry (error tracking — optional) ───────────────────────────────────────
if (process.env.SENTRY_DSN) {
  try {
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
    });
  } catch {
    console.warn('[startup] @sentry/node not installed — error tracking disabled');
  }
}

const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");
const { initKafkaConsumer } = require("./services/kafkaService");
const socketUtil = require("./utils/socket");
const { startBuildTimeoutJob } = require("./jobs/buildTimeoutJob");
const { startUptimeMonitorJob } = require("./jobs/uptimeMonitorJob");
const { startCanaryHealthJob } = require("./jobs/canaryHealthJob");
const { startArtifactRetentionJob } = require("./jobs/artifactRetentionJob");
const { startFailoverJob } = require("./jobs/failoverJob");
const { startBudgetAlertJob } = require("./jobs/budgetAlertJob");
const { startDigestJob } = require("./jobs/digestJob");
const { startAuditRetentionJob } = require("./jobs/auditRetentionJob");
const { prisma } = require("../lib/prisma");
const { resolvePendingRequest } = require("./services/tunnelService");

const logger = (() => {
  try { return require('../lib/logger'); } catch { return console; }
})();

const PORT = parseInt(process.env.PORT || "9000", 10);
const SOCKET_PORT = parseInt(process.env.SOCKET_PORT || "9002", 10);

// ── Express (API) ─────────────────────────────────────────────────────────────
const apiServer = http.createServer(app);
apiServer.listen(PORT, () => {
  logger.info({ port: PORT }, 'API server started');
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
const socketServer = http.createServer();
const io = new Server(socketServer, {
  cors: {
    origin: process.env.NEXTAUTH_URL || "http://localhost:3000",
    credentials: true,
  },
});

io.on("connection", socket => {
  socket.on("subscribe", payload => {
    const deploymentId = typeof payload === "string" ? payload : payload?.deploymentId;
    if (!deploymentId) return;
    socket.join(deploymentId);
    logger.info({ socketId: socket.id, deploymentId }, 'Socket subscribed to deployment');
  });

  socket.on("subscribe_user", userId => {
    if (!userId) return;
    socket.join(`user:${userId}`);
  });

  // Tunnel: CLI client joins a room so the server can relay HTTP requests to it
  socket.on("tunnel:join", tunnelId => {
    if (!tunnelId) return;
    socket.join(`tunnel:${tunnelId}`);
    logger.info({ socketId: socket.id, tunnelId }, 'Tunnel client joined');
  });

  // Tunnel: CLI client sends back the HTTP response to a relayed request
  socket.on("tunnel:response", ({ requestId, statusCode, headers, bodyBase64 }) => {
    resolvePendingRequest(requestId, { statusCode, headers, bodyBase64 });
  });

  socket.on("disconnect", () => {
    logger.info({ socketId: socket.id }, 'Socket disconnected');
  });
});

socketServer.listen(SOCKET_PORT, () => {
  logger.info({ port: SOCKET_PORT }, 'Socket server started');
});

socketUtil.init(io);

// ── Kafka Consumer ────────────────────────────────────────────────────────────
initKafkaConsumer(io).catch(err => {
  logger.error({ err }, 'Failed to initialize Kafka consumer');
});

// ── Background jobs ───────────────────────────────────────────────────────────
startBuildTimeoutJob();
startUptimeMonitorJob();
startCanaryHealthJob();
startArtifactRetentionJob();
startFailoverJob();
startBudgetAlertJob();
startDigestJob();
startAuditRetentionJob();

const { startCronExecutor } = require('./services/cronExecutor');
startCronExecutor();

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info({ signal }, 'Shutdown signal received');

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    await new Promise(resolve => apiServer.close(resolve));
    await new Promise(resolve => socketServer.close(resolve));
    await prisma.$disconnect();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));