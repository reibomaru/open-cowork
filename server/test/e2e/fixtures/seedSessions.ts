import type { Session } from "../../../src/types"

/**
 * シナリオ別 Session seed データ。
 *
 * 各テストで必要な分だけ pick して seedSessions() に渡す。
 */

const NOW = 1_750_000_000_000 // 2025-06-15T... 固定にしてソート順を予測可能にする

/** ユーザー A の active セッション（最新）。 */
export const userASessionLatest: Session = {
  id: "session-a-latest",
  ownerId: "user-a",
  title: "A の最新セッション",
  createdAt: NOW - 60_000,
  updatedAt: NOW,
  status: "active",
  model: "claude-sonnet-4-6",
  permissionMode: "ask",
}

/** ユーザー A の active セッション（中位）。 */
export const userASessionMiddle: Session = {
  id: "session-a-middle",
  ownerId: "user-a",
  title: "A の中位セッション",
  createdAt: NOW - 120_000,
  updatedAt: NOW - 30_000,
  status: "active",
  model: "claude-sonnet-4-6",
  permissionMode: "ask",
}

/** ユーザー A の active セッション（最古）。 */
export const userASessionOldest: Session = {
  id: "session-a-oldest",
  ownerId: "user-a",
  title: "A の最古セッション",
  createdAt: NOW - 180_000,
  updatedAt: NOW - 60_000,
  status: "active",
  model: "claude-sonnet-4-6",
  permissionMode: "ask",
}

/** ユーザー A の archived セッション (listByUserId で除外されるべき)。 */
export const userASessionArchived: Session = {
  id: "session-a-archived",
  ownerId: "user-a",
  title: "A のアーカイブ済み",
  createdAt: NOW - 240_000,
  updatedAt: NOW - 120_000,
  status: "archived",
  model: "claude-sonnet-4-6",
  permissionMode: "ask",
}

/** ユーザー B の active セッション。A から見ると他人のもの (404 になるべき)。 */
export const userBSession: Session = {
  id: "session-b-1",
  ownerId: "user-b",
  title: "B のセッション",
  createdAt: NOW - 30_000,
  updatedAt: NOW,
  status: "active",
  model: "claude-sonnet-4-6",
  permissionMode: "ask",
}

/** New Session のまま（title 自動付与をテストするための seed）。 */
export const userANewSession: Session = {
  id: "session-a-new",
  ownerId: "user-a",
  title: "New Session",
  createdAt: NOW,
  updatedAt: NOW,
  status: "active",
  model: "claude-sonnet-4-6",
  permissionMode: "ask",
}

export const allSeeds = {
  userASessionLatest,
  userASessionMiddle,
  userASessionOldest,
  userASessionArchived,
  userBSession,
  userANewSession,
}
