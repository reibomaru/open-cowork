# Developer Guide

[日本語版 / Japanese version](./DEVELOPMENT.ja.md)

This document covers everything beyond the user-facing [Quick Start](../README.md): how the project is laid out, the scripts that ship with it, and the knobs you'll want to know about when developing.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 / TypeScript / Vite / Tailwind CSS / Zustand |
| Backend | Hono / TypeScript / **@earendil-works/pi-coding-agent** |
| Data | DynamoDB (local: `dynamodb-local` container) |
| Auth | Dev-only fixed `DEV_USER_ID` fallback |

## Project Layout

```
client/                … React SPA
server/                … Hono API server + pi-coding-agent SDK
common-skills/         … Shared skills mounted (RO bind) into the agent
workdir/               … Agent cwd and HTML artifact output
docs/                  … Feature specs and design notes
  └── screenshots/     … README hero images (regenerate via `pnpm screenshot`)
scripts/               … Repo-level helper scripts (screenshot, etc.)
```

The core agent execution code lives in `server/src/agent-query.ts` and `server/src/claude-agent.ts`. The filenames are kept for historical continuity; the implementation runs on pi-coding-agent under the hood.

> This repository does not ship production-grade IaC, CI/CD, or an auth backend.
> To wire up real authentication or a managed database, replace
> `server/src/auth.ts` and `server/src/dynamodb-sessions.ts` with your own
> integrations.

## Prerequisites

- Node.js 22+
- pnpm 10+
- Docker Desktop

## Setup

```bash
pnpm install
[ -f server/.env ] || cp server/.env.example server/.env
[ -f client/.env ] || cat > client/.env << 'EOF'
VITE_API_BASE_URL=http://localhost:5173
VITE_DEV_USER_ID=dev-user-1
EOF
docker compose build server
```

To hit the Anthropic API through pi-coding-agent, export a key (or set it in `server/.env`):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Running Locally

```bash
pnpm dev
```

- Frontend: <http://localhost:5173> (Vite with native HMR)
- Backend: <http://localhost:3000> (Docker container, auto-reload via `--watch`)

## npm Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run frontend + backend together |
| `pnpm dev:client` | Frontend only |
| `pnpm dev:server` | Backend container only |
| `pnpm build` | Build the SPA into `client/dist/` |
| `pnpm check` | Lint + format check (Biome) |
| `pnpm check:fix` | Apply lint + format fixes |
| `pnpm screenshot` | Regenerate README hero images (requires `pnpm dev` to be running) |

Server-side tests (run inside the `server/` workspace):

| Command | Description |
|---------|-------------|
| `pnpm -F server test:unit` | Vitest unit tests |
| `pnpm -F server test:e2e:up` | Spin up the e2e DynamoDB Local container |
| `pnpm -F server test:e2e` | Run the end-to-end Hono tests |
| `pnpm -F server test:e2e:down` | Tear down the e2e container |

## Environment Variables

| File | Key settings |
|------|--------------|
| `server/.env` | `USE_MOCK` (mock vs real agent), `DEV_USER_ID` (auth fallback), `DYNAMODB_TABLE_SESSIONS`, `ANTHROPIC_API_KEY`, `MODEL_PROVIDER`, `PI_AGENT_DIR` |
| `client/.env` | `VITE_DEV_USER_ID` (auth fallback) |

Set `USE_MOCK=true` in `server/.env` to use the in-memory mock agent — handy when iterating on UI without consuming API credits.

## DynamoDB (Local)

`pnpm dev` and `docker compose up server` both bring up a `dynamodb-local`
container plus a `dynamodb-init` helper that creates a `SessionsTableV2`-
equivalent schema (`PK=userId`, `SK=sessionId`, LSI `SessionsByUpdatedAt`,
TTL on `ttl`).

- Data persists in the `dynamodb-local-data` Docker volume. It survives
  `docker compose down`; wipe it with `docker compose down -v`.
- The host port is intentionally **not** bound (otherwise running multiple
  worktrees in parallel would conflict). To inspect the table from the host:

  ```bash
  docker compose run --rm \
    -e AWS_ENDPOINT_URL_DYNAMODB=http://dynamodb-local:8000 \
    dynamodb-init aws dynamodb scan --table-name sessions-local
  ```

## Regenerating Screenshots

Hero images in the READMEs live in `docs/screenshots/`. To regenerate after
UI changes:

1. Start the stack with `pnpm dev` in one terminal.
2. In another terminal: `pnpm screenshot`.

The script uses Playwright (`@playwright/test` from the client workspace) and
captures both the light and dark themes.

## Related Files

- [`README.md`](../README.md) / [`README.ja.md`](../README.ja.md) — user-facing quick start
- [`server/.env.example`](../server/.env.example) — full list of server env vars
- [`scripts/screenshot.mjs`](../scripts/screenshot.mjs) — screenshot generator
