import type { Session } from "../types"

// mock セッションの owner。実運用では authMiddleware の userId に置き換わる。
const SEED_OWNER = process.env.DEV_USER_ID ?? "local-dev-user"

export const seedSessions: Session[] = [
  {
    id: "session-1",
    ownerId: SEED_OWNER,
    title: "Authentication Module Refactor",
    createdAt: Date.now() - 3600000 * 2,
    updatedAt: Date.now() - 3600000,
    status: "active",
    model: "claude-sonnet-4-6",
    permissionMode: "ask",
  },
  {
    id: "session-2",
    ownerId: SEED_OWNER,
    title: "Fix API Rate Limiting Bug",
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000 + 3600000,
    status: "active",
    model: "claude-sonnet-4-6",
    permissionMode: "auto",
  },
  {
    id: "session-3",
    ownerId: SEED_OWNER,
    title: "Add Unit Tests for UserService",
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 3,
    status: "archived",
    model: "claude-sonnet-4-6",
    permissionMode: "ask",
  },
]
