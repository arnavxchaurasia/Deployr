'use strict';

// Integrations marketplace registry — third-party connectors a project can
// enable. Each connector's config values are injected as build-time env
// vars (see envVars()), so e.g. enabling Sentry here means every build
// automatically gets SENTRY_DSN without the user hand-adding it as a
// regular environment variable. Distinct from Project.notifyWebhookUrl
// (Deployr's own deployment-event webhook) — these are third-party app
// connectors.
const CONNECTORS = {
  slack: {
    id: 'slack',
    name: 'Slack',
    description: 'Post deploy notifications to a Slack channel via an incoming webhook.',
    fields: [{ key: 'webhookUrl', label: 'Incoming Webhook URL', type: 'url' }],
    envVars: (cfg) => (cfg.webhookUrl ? { SLACK_WEBHOOK_URL: cfg.webhookUrl } : {}),
  },
  sentry: {
    id: 'sentry',
    name: 'Sentry',
    description: 'Injects your Sentry DSN into every build so error tracking works out of the box.',
    fields: [{ key: 'dsn', label: 'DSN', type: 'text' }],
    envVars: (cfg) => (cfg.dsn ? { SENTRY_DSN: cfg.dsn } : {}),
  },
  datadog: {
    id: 'datadog',
    name: 'Datadog',
    description: 'Injects your Datadog API key into every build for APM/log shipping.',
    fields: [{ key: 'apiKey', label: 'API Key', type: 'password' }],
    envVars: (cfg) => (cfg.apiKey ? { DD_API_KEY: cfg.apiKey } : {}),
  },
};

function listConnectors() {
  return Object.values(CONNECTORS).map(({ id, name, description, fields }) => ({ id, name, description, fields }));
}

function getConnector(id) {
  return CONNECTORS[id] ?? null;
}

// Flattens every enabled connector's config into one env var map, to be
// merged alongside a project's own environment variables at build time.
function buildIntegrationEnvVars(integrations) {
  if (!integrations || typeof integrations !== 'object') return {};
  const env = {};
  for (const [connectorId, cfg] of Object.entries(integrations)) {
    if (!cfg?.enabled) continue;
    const connector = CONNECTORS[connectorId];
    if (!connector) continue;
    Object.assign(env, connector.envVars(cfg));
  }
  return env;
}

const { prisma } = require('../../lib/prisma');

async function getProjectSlackWebhook(projectId) {
  // Look up Slack integration for this project's org or user
  // The Integration model has: projectId (optional), orgId (optional), type, config (JSON with webhookUrl)
  const integration = await prisma.integration.findFirst({
    where: { type: 'slack', OR: [{ projectId }, { project: { id: projectId } }] },
  });
  return integration?.config?.webhookUrl || null;
}

module.exports = { CONNECTORS, listConnectors, getConnector, buildIntegrationEnvVars, getProjectSlackWebhook };
