# Deployr CLI

Deploy from your terminal.

## Install

```bash
npm install -g deployr-cli
# or use directly
node cli/index.js
```

## Setup

```bash
deployr login
```

Generate an API key in the Deployr dashboard under Settings → API Keys, then paste it when prompted.

## Commands

| Command | Description |
|---------|-------------|
| `deployr login` | Save your API key |
| `deployr ls` | List all projects |
| `deployr deploy <projectId>` | Trigger a deployment |
| `deployr logs <deploymentId>` | Print build logs |
| `deployr status <projectId>` | Show latest deployment |
