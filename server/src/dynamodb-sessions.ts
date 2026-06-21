import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb"
import type { AgentTurnUsage } from "./agent-query"
import { createLogger } from "./logger"
import type { Session } from "./types"

const log = createLogger("dynamodb-sessions")

const TABLE_NAME = process.env.DYNAMODB_TABLE_SESSIONS ?? ""
const REGION = process.env.AWS_REGION ?? "ap-northeast-1"
const LSI_NAME = "SessionsByUpdatedAt"

const baseClient = new DynamoDBClient({ region: REGION })
const docClient = DynamoDBDocumentClient.from(baseClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
})

/**
 * DynamoDB に格納する Session 永続化レコード。
 * PK = userId (= Session.ownerId)、SK = sessionId (= Session.id)。
 * Session interface のフィールドは平置きで保持する。
 *
 * 使用量だけは Session.usage (ネスト) ではなく usageInputTokens 等のフラットな
 * トップレベル数値属性で保持する。ADD による原子的加算をネストした map で行うと
 * 親 map の初期化問題が出るため、フラット属性にして並行/連続加算を安全にする。
 */
type SessionRecord = Omit<Session, "usage"> & {
  userId: string
  sessionId: string
  /** TTL 用 epoch sec。CDK で `timeToLiveAttribute: "ttl"` 設定済。*/
  ttl?: number
  /** 累計トークン使用量・コスト (ADD で加算するフラット属性)。未加算なら欠落。 */
  usageInputTokens?: number
  usageOutputTokens?: number
  usageCacheReadTokens?: number
  usageCacheCreationTokens?: number
  usageCostUSD?: number
}

function ensureTable(): void {
  if (!TABLE_NAME) {
    throw new Error("DYNAMODB_TABLE_SESSIONS env is not set")
  }
}

function recordToSession(record: SessionRecord): Session {
  // LSI `SessionsByUpdatedAt` の projection には `id` / `ownerId` が含まれない。
  // PK/SK (userId / sessionId) は常に projection されるのでフォールバックする。
  return {
    id: record.id ?? record.sessionId,
    ownerId: record.ownerId ?? record.userId,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: record.status,
    model: record.model,
    permissionMode: record.permissionMode,
    workingDir: record.workingDir,
    sdkSessionId: record.sdkSessionId,
    titleGenerated: record.titleGenerated,
    usage: recordToUsage(record),
  }
}

/**
 * フラットな usage* 属性をネストした Session.usage へ再構成する。
 * いずれの属性も無い (= 1 ターンも完了していない) なら undefined を返す。
 * LSI 経由のレコードには usage* が projection されないので、その場合も undefined になる。
 */
function recordToUsage(record: SessionRecord): Session["usage"] {
  if (
    record.usageInputTokens === undefined &&
    record.usageOutputTokens === undefined &&
    record.usageCacheReadTokens === undefined &&
    record.usageCacheCreationTokens === undefined &&
    record.usageCostUSD === undefined
  ) {
    return undefined
  }
  return {
    inputTokens: record.usageInputTokens ?? 0,
    outputTokens: record.usageOutputTokens ?? 0,
    cacheReadInputTokens: record.usageCacheReadTokens ?? 0,
    cacheCreationInputTokens: record.usageCacheCreationTokens ?? 0,
    costUSD: record.usageCostUSD ?? 0,
  }
}

function sessionToRecord(session: Session): SessionRecord {
  // usage はフラットな usageInputTokens 等で保持するため、ネストの usage は持たせない。
  // 新規作成 (putSession) 時点では usage は未確定なので、ここでは展開しない。
  // 累計は addSessionUsage の ADD だけが書き込む。
  const { usage: _usage, ...rest } = session
  return {
    ...rest,
    userId: session.ownerId,
    sessionId: session.id,
  }
}

/**
 * userId に紐づく非 archived セッションを updatedAt 降順で取得する。
 * LSI `SessionsByUpdatedAt` をクエリし、status='archived' を FilterExpression で除外する。
 */
export async function listByUserId(userId: string): Promise<Session[]> {
  ensureTable()
  const cmd = new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: LSI_NAME,
    KeyConditionExpression: "userId = :u",
    FilterExpression: "#st <> :archived",
    ExpressionAttributeNames: { "#st": "status" },
    ExpressionAttributeValues: {
      ":u": userId,
      ":archived": "archived",
    },
    ScanIndexForward: false,
  })
  const res = await docClient.send(cmd)
  const items = (res.Items ?? []) as SessionRecord[]
  return items.map(recordToSession)
}

export async function getSession(userId: string, sessionId: string): Promise<Session | null> {
  ensureTable()
  const cmd = new GetCommand({
    TableName: TABLE_NAME,
    Key: { userId, sessionId },
    ConsistentRead: true,
  })
  const res = await docClient.send(cmd)
  if (!res.Item) return null
  return recordToSession(res.Item as SessionRecord)
}

export async function putSession(session: Session): Promise<void> {
  ensureTable()
  const cmd = new PutCommand({
    TableName: TABLE_NAME,
    Item: sessionToRecord(session),
  })
  await docClient.send(cmd)
}

export interface SessionPatch {
  title?: string
  status?: Session["status"]
  model?: string
  permissionMode?: string
  titleGenerated?: boolean
  workingDir?: string
}

/**
 * 部分更新。属性が存在するもののみ UpdateExpression に組み立てる。
 * 戻り値は更新後の Session、存在しない (ownership 不一致 or 削除済) なら null。
 */
export async function patchSession(
  userId: string,
  sessionId: string,
  patch: SessionPatch,
  updatedAt: number = Date.now(),
): Promise<Session | null> {
  ensureTable()
  const sets: string[] = ["#updatedAt = :updatedAt"]
  const names: Record<string, string> = { "#updatedAt": "updatedAt" }
  const values: Record<string, unknown> = { ":updatedAt": updatedAt }

  if (patch.title !== undefined) {
    sets.push("#title = :title")
    names["#title"] = "title"
    values[":title"] = patch.title
  }
  if (patch.status !== undefined) {
    sets.push("#status = :status")
    names["#status"] = "status"
    values[":status"] = patch.status
  }
  if (patch.model !== undefined) {
    sets.push("#model = :model")
    names["#model"] = "model"
    values[":model"] = patch.model
  }
  if (patch.permissionMode !== undefined) {
    sets.push("#permissionMode = :permissionMode")
    names["#permissionMode"] = "permissionMode"
    values[":permissionMode"] = patch.permissionMode
  }
  if (patch.titleGenerated !== undefined) {
    sets.push("#titleGenerated = :titleGenerated")
    names["#titleGenerated"] = "titleGenerated"
    values[":titleGenerated"] = patch.titleGenerated
  }
  if (patch.workingDir !== undefined) {
    sets.push("#workingDir = :workingDir")
    names["#workingDir"] = "workingDir"
    values[":workingDir"] = patch.workingDir
  }

  const cmd = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { userId, sessionId },
    ConditionExpression: "attribute_exists(sessionId)",
    UpdateExpression: `SET ${sets.join(", ")}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ReturnValues: "ALL_NEW",
  })

  try {
    const res = await docClient.send(cmd)
    return res.Attributes ? recordToSession(res.Attributes as SessionRecord) : null
  } catch (err) {
    if ((err as { name?: string }).name === "ConditionalCheckFailedException") {
      return null
    }
    throw err
  }
}

export async function deleteSession(userId: string, sessionId: string): Promise<void> {
  ensureTable()
  const cmd = new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { userId, sessionId },
  })
  await docClient.send(cmd)
}

/**
 * SDK が init 時に発行した session_id を保存する。resume 時に取り出して再投入する。
 */
export async function setSdkSessionId(
  userId: string,
  sessionId: string,
  sdkSessionId: string,
): Promise<void> {
  ensureTable()
  const cmd = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { userId, sessionId },
    UpdateExpression: "SET sdkSessionId = :sid",
    ExpressionAttributeValues: { ":sid": sdkSessionId },
  })
  try {
    await docClient.send(cmd)
  } catch (err) {
    log.warn("setSdkSessionId failed", {
      userId,
      sessionId,
      error: String(err),
    })
    throw err
  }
}

export async function getSdkSessionId(
  userId: string,
  sessionId: string,
): Promise<string | undefined> {
  const session = await getSession(userId, sessionId)
  return session?.sdkSessionId
}

/**
 * 1 ターン分の使用量デルタをセッションの累計へ原子的に加算する。
 *
 * patchSession (SET) ではなく ADD を使う理由:
 *   - ADD は属性が無ければ 0 から加算するので if_not_exists 不要。
 *   - 並行/連続ターンでも last-writer-wins にならず取りこぼさない。
 * フラットなトップレベル数値属性 (usageInputTokens 等) に加算する。
 *
 * 失敗 (セッション削除など) はログのみで握りつぶす。呼び出し元は fire-and-forget。
 */
export async function addSessionUsage(
  userId: string,
  sessionId: string,
  delta: AgentTurnUsage,
  updatedAt: number = Date.now(),
): Promise<void> {
  ensureTable()
  const cmd = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { userId, sessionId },
    ConditionExpression: "attribute_exists(sessionId)",
    UpdateExpression:
      "ADD usageInputTokens :it, usageOutputTokens :ot, usageCacheReadTokens :cr, usageCacheCreationTokens :cc, usageCostUSD :cost SET updatedAt = :u",
    ExpressionAttributeValues: {
      ":it": delta.inputTokens,
      ":ot": delta.outputTokens,
      ":cr": delta.cacheReadInputTokens,
      ":cc": delta.cacheCreationInputTokens,
      ":cost": delta.costUSD,
      ":u": updatedAt,
    },
  })
  try {
    await docClient.send(cmd)
  } catch (err) {
    if ((err as { name?: string }).name === "ConditionalCheckFailedException") {
      // ストリーム中にセッションが削除された等。累計はもう不要なので無視。
      log.warn("addSessionUsage: session no longer exists", { userId, sessionId })
      return
    }
    log.warn("addSessionUsage failed", { userId, sessionId, error: String(err) })
    throw err
  }
}
