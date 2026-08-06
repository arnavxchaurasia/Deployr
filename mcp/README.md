# Deployr MCP Server

Lets AI assistants (Claude Desktop, Claude Code, or any other MCP client) list your
Deployr projects, trigger deploys, check status, read build logs, and promote/rollback
deployments on your behalf — using the same API-key auth as the CLI.

## Install

```bash
cd mcp
npm install
```

## Setup

Generate an API key in the Deployr dashboard under Settings → API Keys, then set:

```bash
export DEPLOYR_API_KEY=dplr_xxxxxxxxxxxx
export DEPLOYR_API_URL=https://api.your-deployr-instance.com   # defaults to http://localhost:8000
```

## Use with Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "deployr": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/index.js"],
      "env": {
        "DEPLOYR_API_KEY": "dplr_xxxxxxxxxxxx",
        "DEPLOYR_API_URL": "https://api.your-deployr-instance.com"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List every project visible to this account/org |
| `get_project` | A project's status, live URL, and build config |
| `list_deployments` | Every deployment for a project |
| `get_deployment` | A single deployment's status |
| `get_deployment_logs` | Build/runtime logs for a deployment |
| `trigger_deploy` | Deploy a project on a given branch |
| `cancel_deployment` | Cancel an in-progress deployment |
| `promote_deployment` | Promote/rollback to a specific deployment |
| `compare_deployments` | Diff two deployments (branch, commit, timestamps, env vars) |
| `get_usage` | Plan and monthly build-minute quota usage |

Every action goes through the same authorization rules as the dashboard and CLI
(org role checks, build-quota enforcement, etc.) — this server has no elevated access,
it just calls the same REST API with your API key.
