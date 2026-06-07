import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceInUseException,
} from "@aws-sdk/client-dynamodb"

/**
 * Vitest globalSetup — テストプロセス起動時に 1 回だけ走る。
 *
 *  1. DynamoDB Local (localhost:8100) が応答するまで待つ
 *  2. 既存テーブルがあれば削除（前回 run の残骸対策）
 *  3. Sessions テーブル + SessionsByUpdatedAt LSI を作成
 *
 * テーブル定義は infra/cdk/lib/constructs/storage.ts と揃える:
 *   PK: userId (S), SK: sessionId (S)
 *   LSI SessionsByUpdatedAt: SK updatedAt (N), projection INCLUDE
 *
 * 各テストでの seed/truncate は setupAfterEach.ts と各テストで行う。
 */

const ENDPOINT = process.env.AWS_ENDPOINT_URL_DYNAMODB ?? "http://localhost:8100"
const TABLE_NAME = process.env.DYNAMODB_TABLE_SESSIONS ?? "open-cowork-sessions-test"

const client = new DynamoDBClient({
  endpoint: ENDPOINT,
  region: process.env.AWS_REGION ?? "ap-northeast-1",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
})

async function waitForDynamoDb(maxAttempts = 60, intervalMs = 500): Promise<void> {
  let lastErr: unknown
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await client.send(new DescribeTableCommand({ TableName: "__probe__" }))
      return
    } catch (err) {
      const name = (err as { name?: string }).name
      if (name === "ResourceNotFoundException") return
      lastErr = err
      await new Promise((r) => setTimeout(r, intervalMs))
    }
  }
  throw new Error(
    `DynamoDB Local not responding at ${ENDPOINT} after ${maxAttempts * intervalMs}ms: ${
      (lastErr as Error)?.message ?? lastErr
    }`,
  )
}

async function dropTableIfExists(): Promise<void> {
  try {
    await client.send(new DeleteTableCommand({ TableName: TABLE_NAME }))
  } catch (err) {
    if ((err as { name?: string }).name !== "ResourceNotFoundException") throw err
  }
}

async function createTable(): Promise<void> {
  try {
    await client.send(
      new CreateTableCommand({
        TableName: TABLE_NAME,
        AttributeDefinitions: [
          { AttributeName: "userId", AttributeType: "S" },
          { AttributeName: "sessionId", AttributeType: "S" },
          { AttributeName: "updatedAt", AttributeType: "N" },
        ],
        KeySchema: [
          { AttributeName: "userId", KeyType: "HASH" },
          { AttributeName: "sessionId", KeyType: "RANGE" },
        ],
        LocalSecondaryIndexes: [
          {
            IndexName: "SessionsByUpdatedAt",
            KeySchema: [
              { AttributeName: "userId", KeyType: "HASH" },
              { AttributeName: "updatedAt", KeyType: "RANGE" },
            ],
            Projection: {
              ProjectionType: "INCLUDE",
              NonKeyAttributes: [
                "title",
                "status",
                "model",
                "createdAt",
                "permissionMode",
                "sdkSessionId",
              ],
            },
          },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    )
  } catch (err) {
    if (!(err instanceof ResourceInUseException)) throw err
  }
}

export async function setup(): Promise<void> {
  await waitForDynamoDb()
  await dropTableIfExists()
  await createTable()
}

export async function teardown(): Promise<void> {
  await dropTableIfExists()
  client.destroy()
}
