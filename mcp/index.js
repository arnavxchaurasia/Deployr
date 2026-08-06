#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Reuses the same API-key Bearer auth as the CLI (cli/lib/api.js) — set
// DEPLOYR_API_KEY to a key from the dashboard's Settings → Keys page.
const API_URL = process.env.DEPLOYR_API_URL || "http://localhost:8000";
const API_KEY = process.env.DEPLOYR_API_KEY;

if (!API_KEY) {
  console.error("DEPLOYR_API_KEY is not set — this MCP server has no way to authenticate to Deployr.");
  process.exit(1);
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const message = (data && data.error) || res.statusText;
    throw new Error(`Deployr API error (${res.status}): ${message}`);
  }
  return data;
}

function toolResult(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

const server = new McpServer({
  name: "deployr",
  version: "0.1.0",
});

server.tool(
  "list_projects",
  "List every project the authenticated Deployr account (or org) can see, with current deploy status and live URL.",
  {},
  async () => toolResult(await api("/projects"))
);

server.tool(
  "get_project",
  "Get a single project's details: status, live URL, build config, and deployment count.",
  { projectId: z.string().describe("Deployr project id") },
  async ({ projectId }) => toolResult(await api(`/project/${projectId}`))
);

server.tool(
  "list_deployments",
  "List every deployment for a project, newest first, including status, branch, trigger, and preview URL.",
  { projectId: z.string().describe("Deployr project id") },
  async ({ projectId }) => toolResult(await api(`/project/${projectId}/deployments`))
);

server.tool(
  "get_deployment",
  "Get a single deployment's current status.",
  { deploymentId: z.string().describe("Deployr deployment id") },
  async ({ deploymentId }) => toolResult(await api(`/deployment/${deploymentId}`))
);

server.tool(
  "get_deployment_logs",
  "Fetch the build/runtime logs recorded so far for a deployment. Use this to diagnose a failed build.",
  { deploymentId: z.string().describe("Deployr deployment id") },
  async ({ deploymentId }) => toolResult(await api(`/logs/${deploymentId}`))
);

server.tool(
  "trigger_deploy",
  "Trigger a new deployment for a project on a given branch (defaults to main). Subject to the project's monthly build-minute quota.",
  {
    projectId: z.string().describe("Deployr project id"),
    branch: z.string().optional().describe("Branch to deploy — defaults to main"),
  },
  async ({ projectId, branch }) =>
    toolResult(await api("/deploy", { method: "POST", body: { projectId, ...(branch ? { branch } : {}) } }))
);

server.tool(
  "cancel_deployment",
  "Cancel an in-progress (QUEUED or BUILDING) deployment.",
  { deploymentId: z.string().describe("Deployr deployment id") },
  async ({ deploymentId }) => toolResult(await api(`/deployments/${deploymentId}/cancel`, { method: "POST" }))
);

server.tool(
  "promote_deployment",
  "Promote a READY deployment to production (or roll back to a previous one) — this is the same action as clicking Promote/Rollback in the dashboard.",
  { deploymentId: z.string().describe("Deployr deployment id") },
  async ({ deploymentId }) => toolResult(await api(`/deployments/${deploymentId}/promote`, { method: "POST" }))
);

server.tool(
  "compare_deployments",
  "Compare two deployments in the same project — branch, commit, trigger, timestamps, and (for admins) current env vars.",
  {
    deploymentIdA: z.string().describe("First deployment id"),
    deploymentIdB: z.string().describe("Second deployment id"),
  },
  async ({ deploymentIdA, deploymentIdB }) =>
    toolResult(await api(`/deployments/compare?a=${deploymentIdA}&b=${deploymentIdB}`))
);

server.tool(
  "get_usage",
  "Check the authenticated account's plan and monthly build-minute quota usage.",
  {},
  async () => toolResult(await api("/usage"))
);

const transport = new StdioServerTransport();
await server.connect(transport);
