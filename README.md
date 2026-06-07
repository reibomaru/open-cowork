# Open Cowork

[日本語版 / Japanese version](./README.ja.md)

An AI assistant web application powered by [`@earendil-works/pi-coding-agent`](https://github.com/earendil-works/pi/tree/main/packages/coding-agent).

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
```

The core agent execution code lives in `server/src/agent-query.ts` and `server/src/claude-agent.ts`.
The filenames are kept for historical continuity; the implementation is built on pi-coding-agent.

> This repository does not ship production-grade IaC, CI/CD, or an auth backend.
> If you need real authentication or cloud database persistence,
> replace `server/src/auth.ts` and `server/src/dynamodb-sessions.ts`.

## Local Development

### Prerequisites

- Node.js 22+
- pnpm 10+
- Docker Desktop

### Setup

```bash
pnpm install
[ -f server/.env ] || cp server/.env.example server/.env
[ -f client/.env ] || cat > client/.env << 'EOF'
VITE_API_BASE_URL=http://localhost:5173
VITE_DEV_USER_ID=dev-user-1
EOF
docker compose build server
```

To hit the Anthropic API directly through pi-coding-agent, export an API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### Run

```bash
pnpm dev
```

- Frontend: <http://localhost:5173> (Vite, native HMR)
- Backend: <http://localhost:3000> (Docker container, auto-restart via `--watch`)

### npm Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run frontend + backend together |
| `pnpm dev:client` | Frontend only |
| `pnpm dev:server` | Backend container only |
| `pnpm build` | Build the SPA into `client/dist/` |
| `pnpm check:fix` | Lint + format with Biome |

### Environment Variables

| File | Key settings |
|------|--------------|
| `server/.env` | `USE_MOCK` (toggle mock / real agent), `DEV_USER_ID` (auth fallback), `DYNAMODB_TABLE_SESSIONS`, `ANTHROPIC_API_KEY`, `MODEL_PROVIDER`, `PI_AGENT_DIR` |
| `client/.env` | `VITE_DEV_USER_ID` (auth fallback) |

Set `USE_MOCK=true` in `server/.env` to use the in-memory mock agent — handy for UI development without an API key.

### DynamoDB (Local)

`pnpm dev` and `docker compose up server` both bring up a `dynamodb-local`
container together with a `dynamodb-init` helper that creates a `SessionsTableV2`-
equivalent schema (`PK=userId`, `SK=sessionId`, LSI `SessionsByUpdatedAt`,
TTL on `ttl`).

- Data is persisted in the `dynamodb-local-data` volume.
  Survives `docker compose down`; wiped by `docker compose down -v`.
- The host port for DynamoDB is intentionally **not** bound (it would clash when
  running multiple worktrees in parallel). To poke around from the host:

  ```bash
  docker compose run --rm \
    -e AWS_ENDPOINT_URL_DYNAMODB=http://dynamodb-local:8000 \
    dynamodb-init aws dynamodb scan --table-name sessions-local
  ```
