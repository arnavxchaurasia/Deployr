# Deployr

A self-hosted Vercel-style deploy platform: push to GitHub/GitLab/Bitbucket,
Deployr builds your app in an isolated container, uploads static output to S3,
and serves it (or SSR/edge functions) through a Cloudflare edge worker.

## Architecture

| Package | Role |
|---|---|
| [`api-server/`](api-server) | Node/Express/Prisma backend — auth, projects, deployments, orgs, billing, webhooks |
| [`frontend/`](frontend) | Next.js dashboard |
| [`server/`](server) | The build container image — clones the repo, installs/builds, uploads to S3, packages Lambda functions. Runs once per deployment on ECS Fargate |
| [`cloudflare-worker/`](cloudflare-worker) | Edge router — resolves a hostname to a deployment, proxies to Lambda (SSR/functions) or serves static assets from S3, handles canary splits and preview protection |
| [`s3-reverse-proxy/`](s3-reverse-proxy) | Legacy/local-dev static-asset proxy (predates the Cloudflare worker) |
| [`cli/`](cli) | `deployr` CLI — deploy, logs, env pull/push |
| [`mcp/`](mcp) | MCP server exposing the API to AI assistants (Claude, etc.) |

## Local development

```bash
cp .env.example api-server/.env   # fill in AWS/Kafka/Razorpay/etc. credentials
docker compose up
```

See `docker-compose.yml` for how the services are wired together in production
(behind Caddy for TLS), and each package's own README for service-specific
setup (`cli/README.md`, `mcp/README.md`).

## Database

`api-server/prisma/schema.prisma` is the single source of truth. Run
migrations from `api-server/`:

```bash
npx prisma migrate deploy
```

No other package should read/write the database directly — everything goes
through `api-server`'s REST API.
