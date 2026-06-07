import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb"
import type { Session } from "../../../src/types"

/**
 * テスト用 DynamoDB クライアント。
 *
 * 環境変数 AWS_ENDPOINT_URL_DYNAMODB を見るため、vitest.config.ts で設定した
 * `http://localhost:8100` に勝手につながる。dynamodb-sessions.ts も
 * 同じ env を参照する。
 */

const TABLE_NAME = process.env.DYNAMODB_TABLE_SESSIONS ?? "open-cowork-sessions-test"

export const ddbClient = new DynamoDBClient({})
export const ddbDoc = DynamoDBDocumentClient.from(ddbClient)

/**
 * Session を DynamoDB レコード形に変換する。
 * dynamodb-sessions.ts の sessionToRecord と等価。
 */
function sessionToRecord(session: Session): Record<string, unknown> {
  return {
    ...session,
    userId: session.ownerId,
    sessionId: session.id,
  }
}

/**
 * テーブルを scan して全件削除する。
 */
export async function truncateSessions(): Promise<void> {
  const scan = await ddbDoc.send(new ScanCommand({ TableName: TABLE_NAME }))
  const items = scan.Items ?? []
  if (items.length === 0) return

  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25)
    await ddbDoc.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: chunk.map((item) => ({
            DeleteRequest: {
              Key: { userId: item.userId, sessionId: item.sessionId },
            },
          })),
        },
      }),
    )
  }
}

/**
 * Session のリストを seed する。Session 型から DynamoDB レコード形に変換して入れる。
 */
export async function seedSessions(sessions: Session[]): Promise<void> {
  if (sessions.length === 0) return
  for (let i = 0; i < sessions.length; i += 25) {
    const chunk = sessions.slice(i, i + 25)
    await ddbDoc.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: chunk.map((s) => ({
            PutRequest: { Item: sessionToRecord(s) },
          })),
        },
      }),
    )
  }
}

/**
 * userId + sessionId で 1 件取得（アサーション用）。
 */
export async function getSessionRecord(
  userId: string,
  sessionId: string,
): Promise<Record<string, unknown> | null> {
  const result = await ddbDoc.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { userId, sessionId },
    }),
  )
  return result.Item ?? null
}

/**
 * 全件スキャン（アサーション用）。
 */
export async function scanAllSessions(): Promise<Record<string, unknown>[]> {
  const scan = await ddbDoc.send(new ScanCommand({ TableName: TABLE_NAME }))
  return scan.Items ?? []
}
