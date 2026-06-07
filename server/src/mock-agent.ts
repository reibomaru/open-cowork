import { v4 as uuid } from "uuid"
import type { SSEEvent } from "./types"

function textChunks(text: string, chunkSize = 3): SSEEvent[] {
  const events: SSEEvent[] = []
  for (let i = 0; i < text.length; i += chunkSize) {
    events.push({
      event: "text_delta",
      data: { chunk: text.slice(i, i + chunkSize) },
      delay: 15 + Math.random() * 25,
    })
  }
  return events
}

function readFileCall(filePath: string, content: string): SSEEvent[] {
  const id = uuid()
  return [
    {
      event: "tool_call_start",
      data: { id, type: "Read", input: { file_path: filePath } },
      delay: 200,
    },
    { event: "tool_call_output", data: { id, output: content }, delay: 300 },
    { event: "tool_call_end", data: { id, duration: 85 }, delay: 50 },
  ]
}

function editFileCall(filePath: string, oldStr: string, newStr: string): SSEEvent[] {
  const id = uuid()
  return [
    {
      event: "tool_call_start",
      data: {
        id,
        type: "Edit",
        input: { file_path: filePath, old_string: oldStr, new_string: newStr },
      },
      delay: 200,
    },
    {
      event: "diff",
      data: {
        id,
        filePath,
        hunks: [
          {
            oldStart: 10,
            newStart: 10,
            lines: [
              ...oldStr.split("\n").map((l) => ({ type: "remove", content: l })),
              ...newStr.split("\n").map((l) => ({ type: "add", content: l })),
            ],
          },
        ],
      },
      delay: 200,
    },
    { event: "tool_call_end", data: { id, duration: 120 }, delay: 50 },
  ]
}

function bashCall(command: string, output: string): SSEEvent[] {
  const id = uuid()
  const chunks = output.match(/.{1,80}/g) || [output]
  return [
    { event: "tool_call_start", data: { id, type: "Bash", input: { command } }, delay: 300 },
    ...chunks.map((chunk) => ({
      event: "bash_output" as const,
      data: { id, chunk: `${chunk}\n` },
      delay: 100 + Math.random() * 200,
    })),
    { event: "tool_call_end", data: { id, duration: 1800 + Math.random() * 2000 }, delay: 100 },
  ]
}

function globCall(pattern: string, files: string[]): SSEEvent[] {
  const id = uuid()
  return [
    { event: "tool_call_start", data: { id, type: "Glob", input: { pattern } }, delay: 150 },
    { event: "tool_call_output", data: { id, output: files.join("\n") }, delay: 200 },
    { event: "tool_call_end", data: { id, duration: 45 }, delay: 50 },
  ]
}

function grepCall(pattern: string, results: string): SSEEvent[] {
  const id = uuid()
  return [
    {
      event: "tool_call_start",
      data: { id, type: "Grep", input: { pattern, path: "/src" } },
      delay: 150,
    },
    { event: "tool_call_output", data: { id, output: results }, delay: 250 },
    { event: "tool_call_end", data: { id, duration: 62 }, delay: 50 },
  ]
}

function planEvents(title: string, steps: string[]): SSEEvent[] {
  const planId = uuid()
  return [
    {
      event: "plan",
      data: {
        id: planId,
        title,
        steps: steps.map((desc, i) => ({
          id: `step-${i}`,
          description: desc,
          status: "pending",
        })),
        status: "pending-approval",
      },
      delay: 500,
    },
  ]
}

function htmlBlockEvents(title: string, html: string): SSEEvent[] {
  const id = uuid()
  const chunks = html.match(/.{1,100}/g) || [html]
  return [
    { event: "html_block_start", data: { id, title }, delay: 200 },
    ...chunks.map((chunk) => ({
      event: "html_block_delta" as const,
      data: { id, chunk },
      delay: 30 + Math.random() * 50,
    })),
    { event: "html_block_end", data: { id }, delay: 100 },
  ]
}

function subagentEvents(name: string, type: string, prompt: string, output: string): SSEEvent[] {
  const id = uuid()
  return [
    {
      event: "subagent_start",
      data: { id, name, type, prompt },
      delay: 300,
    },
    {
      event: "subagent_update",
      data: { id, status: "completed", output },
      delay: 2000 + Math.random() * 3000,
    },
  ]
}

/**
 * ローカル UI 確認用のダミー usage イベント。実エージェント実行時は claude-agent.ts が
 * pi-coding-agent の turn_end から実値を流す。ここではトークン/コストの見栄えだけ再現する。
 */
function usageEvent(): SSEEvent {
  return {
    event: "usage",
    data: {
      inputTokens: 1200 + Math.floor(Math.random() * 800),
      outputTokens: 300 + Math.floor(Math.random() * 500),
      cacheReadInputTokens: Math.floor(Math.random() * 2000),
      cacheCreationInputTokens: Math.floor(Math.random() * 400),
      costUSD: 0.002 + Math.random() * 0.01,
    },
    delay: 50,
  }
}

/**
 * 各シナリオの最終 done イベントの直前にダミー usage イベントを差し込む。
 * 実エージェント (streamClaudeAgentResponse) と同じ「done より前に usage が来る」順序を再現する。
 */
function withUsage(events: SSEEvent[]): SSEEvent[] {
  const doneIdx = events.findIndex((e) => e.event === "done")
  if (doneIdx < 0) return [...events, usageEvent()]
  return [...events.slice(0, doneIdx), usageEvent(), ...events.slice(doneIdx)]
}

export function generateScenario(userMessage: string): SSEEvent[] {
  return withUsage(generateScenarioInner(userMessage))
}

function generateScenarioInner(userMessage: string): SSEEvent[] {
  const msg = userMessage.toLowerCase()

  // HTML visualization scenario
  if (
    msg.includes("chart") ||
    msg.includes("グラフ") ||
    msg.includes("可視化") ||
    msg.includes("html") ||
    msg.includes("テーブル") ||
    msg.includes("table")
  ) {
    return [
      ...textChunks("データを可視化します。以下にリッチなHTMLで表示します。\n\n"),
      ...htmlBlockEvents(
        "Q1 Sales Report",
        `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; background: #f8f9fa; color: #1a1a1a; }
  h2 { font-size: 1.25rem; margin-bottom: 16px; color: #183181; }
  .summary { display: flex; gap: 16px; margin-bottom: 24px; }
  .card { flex: 1; background: white; border-radius: 8px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .card .label { font-size: 0.75rem; color: #666; text-transform: uppercase; letter-spacing: 0.05em; }
  .card .value { font-size: 1.5rem; font-weight: 700; margin-top: 4px; }
  .card .change { font-size: 0.8rem; margin-top: 4px; }
  .positive { color: #16a34a; }
  .negative { color: #dc2626; }
  table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  th { background: #183181; color: white; padding: 12px 16px; text-align: left; font-size: 0.85rem; font-weight: 600; }
  td { padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f0f4ff; }
  .bar-container { width: 100%; background: #e5e7eb; border-radius: 4px; height: 20px; }
  .bar { height: 100%; background: linear-gradient(90deg, #183181, #2563eb); border-radius: 4px; transition: width 0.3s; }
</style>
</head>
<body>
  <h2>Q1 2025 Sales Report</h2>
  <div class="summary">
    <div class="card">
      <div class="label">Total Revenue</div>
      <div class="value">$4.4M</div>
      <div class="change positive">+18.7% vs Q4</div>
    </div>
    <div class="card">
      <div class="label">Avg Deal Size</div>
      <div class="value">$52K</div>
      <div class="change positive">+8.3%</div>
    </div>
    <div class="card">
      <div class="label">Win Rate</div>
      <div class="value">34%</div>
      <div class="change negative">-2.1%</div>
    </div>
  </div>
  <table>
    <thead>
      <tr><th>Month</th><th>Revenue</th><th>Deals</th><th>Growth</th><th>Progress</th></tr>
    </thead>
    <tbody>
      <tr><td>January</td><td>$1.2M</td><td>23</td><td class="positive">+12%</td><td><div class="bar-container"><div class="bar" style="width:67%"></div></div></td></tr>
      <tr><td>February</td><td>$1.4M</td><td>27</td><td class="positive">+16%</td><td><div class="bar-container"><div class="bar" style="width:78%"></div></div></td></tr>
      <tr><td>March</td><td>$1.8M</td><td>35</td><td class="positive">+28%</td><td><div class="bar-container"><div class="bar" style="width:100%"></div></div></td></tr>
    </tbody>
  </table>
</body>
</html>`,
      ),
      ...textChunks(
        "\n\nQ1の売上データを表示しました。3月が最も好調で、前月比+28%の成長を記録しています。全体としてQ4比+18.7%の成長です。",
      ),
      { event: "done", data: {}, delay: 100 },
    ]
  }

  // Fix / Debug scenario
  if (msg.includes("fix") || msg.includes("修正") || msg.includes("bug") || msg.includes("バグ")) {
    return [
      ...textChunks("バグを調査します。まず関連ファイルを確認します。\n\n"),
      ...readFileCall(
        "/src/services/auth.service.ts",
        `import { hash, compare } from 'bcrypt';\nimport { User } from '../models/user.model';\nimport { createToken } from '../utils/jwt';\n\nexport class AuthService {\n  async login(email: string, password: string) {\n    const user = await User.findOne({ email });\n    if (!user) throw new Error('User not found');\n    \n    const valid = await compare(password, user.password);\n    if (!valid) throw new Error('Invalid password');\n    \n    // BUG: トークン有効期限が設定されていない\n    const token = createToken({ userId: user.id });\n    return { token, user };\n  }\n}`,
      ),
      ...textChunks(
        "\n\n問題を発見しました。`createToken`にトークンの有効期限が設定されていません。修正します。\n\n",
      ),
      ...editFileCall(
        "/src/services/auth.service.ts",
        "    const token = createToken({ userId: user.id });",
        "    const token = createToken({ userId: user.id }, { expiresIn: '24h' });",
      ),
      ...textChunks("\n\nテストを実行して修正を確認します。\n\n"),
      ...bashCall(
        'npm test -- --grep "auth"',
        '> my-project@1.0.0 test\n> jest --grep "auth"\n\n PASS  tests/auth.test.ts\n  AuthService\n    ✓ should login with valid credentials (45ms)\n    ✓ should reject invalid password (12ms)\n    ✓ should include expiry in token (8ms)\n\nTest Suites: 1 passed, 1 total\nTests:       3 passed, 3 total\nTime:        1.234s',
      ),
      ...textChunks(
        "\n\n修正完了です。`createToken`に`expiresIn: '24h'`を追加し、トークンの有効期限が24時間に設定されるようにしました。テストもすべてパスしています。",
      ),
      { event: "done", data: {}, delay: 100 },
    ]
  }

  // Refactor scenario
  if (msg.includes("refactor") || msg.includes("リファクタ") || msg.includes("リファクタリング")) {
    return [
      ...textChunks("リファクタリングの計画を立てます。\n\n"),
      ...planEvents("AuthService リファクタリング", [
        "auth.service.ts の責務を分離",
        "TokenService クラスを新規作成",
        "SessionManager クラスを新規作成",
        "テストの更新",
        "統合テストの実行",
      ]),
      ...textChunks("\n\nプランを承認していただければ、リファクタリングを開始します。\n\n"),
      // After plan, spawn sub-agents
      ...subagentEvents(
        "token-service-creator",
        "general-purpose",
        "TokenService クラスを作成し、JWT関連のロジックを移行する",
        "TokenService を /src/services/token.service.ts に作成しました。createToken, verifyToken, refreshToken メソッドを実装済み。",
      ),
      ...subagentEvents(
        "test-updater",
        "general-purpose",
        "TokenService への変更に合わせてテストを更新する",
        "auth.test.ts と新規 token.test.ts を更新。全12テストがパス。",
      ),
      ...textChunks(
        "\n\nリファクタリングが完了しました。AuthServiceからトークン管理ロジックをTokenServiceに分離し、テストもすべてパスしています。",
      ),
      { event: "done", data: {}, delay: 100 },
    ]
  }

  // Explore / Investigate scenario
  if (
    msg.includes("explore") ||
    msg.includes("調べ") ||
    msg.includes("確認") ||
    msg.includes("調査")
  ) {
    return [
      ...textChunks("コードベースを調査します。\n\n"),
      ...globCall("src/**/*.ts", [
        "src/main.ts",
        "src/app.ts",
        "src/controllers/auth.controller.ts",
        "src/controllers/user.controller.ts",
        "src/services/auth.service.ts",
        "src/services/user.service.ts",
        "src/services/email.service.ts",
        "src/models/user.model.ts",
        "src/models/session.model.ts",
        "src/utils/logger.ts",
        "src/utils/config.ts",
      ]),
      ...textChunks("\n\nサービス層のエラーハンドリングパターンを確認します。\n\n"),
      ...grepCall(
        "throw new Error",
        [
          "src/services/auth.service.ts:8:    throw new Error('User not found');",
          "src/services/auth.service.ts:11:    throw new Error('Invalid password');",
          "src/services/user.service.ts:15:    throw new Error('Email already exists');",
          "src/services/user.service.ts:32:    throw new Error('User not found');",
          "src/services/email.service.ts:22:    throw new Error('SMTP connection failed');",
        ].join("\n"),
      ),
      ...textChunks("\n\n"),
      ...readFileCall(
        "/src/utils/logger.ts",
        `import winston from 'winston';\n\nexport const logger = winston.createLogger({\n  level: 'info',\n  format: winston.format.combine(\n    winston.format.timestamp(),\n    winston.format.json()\n  ),\n  transports: [\n    new winston.transports.Console(),\n    new winston.transports.File({ filename: 'error.log', level: 'error' }),\n  ],\n});`,
      ),
      ...textChunks(
        "\n\n## 調査結果\n\nコードベースの構造:\n\n- **Controllers** (2件): auth, user\n- **Services** (3件): auth, user, email\n- **Models** (2件): user, session\n- **Utils** (2件): logger, config\n\n### エラーハンドリング\n\nサービス層では`throw new Error()`による例外が5箇所で使用されています。カスタムエラークラスの導入を検討すると、エラーの種類に応じた適切なHTTPステータスコードの返却が容易になります。\n\n### ロギング\n\nWinstonベースのロガーが設定済みです。コンソールとファイル(error.log)への出力が構成されています。",
      ),
      { event: "done", data: {}, delay: 100 },
    ]
  }

  // Build / Implement scenario
  if (
    msg.includes("build") ||
    msg.includes("実装") ||
    msg.includes("作成") ||
    msg.includes("追加")
  ) {
    return [
      ...textChunks("実装を計画します。\n\n"),
      ...planEvents("新機能: パスワードリセット機能", [
        "パスワードリセットトークンのモデル作成",
        "パスワードリセットサービスの実装",
        "APIエンドポイントの追加",
        "メール送信の統合",
        "テストの作成",
      ]),
      ...textChunks("\n\nプランが承認されたら実装を開始します。\n\n"),
      ...readFileCall(
        "/src/models/user.model.ts",
        `import { Schema, model, Document } from 'mongoose';\n\nexport interface IUser extends Document {\n  email: string;\n  password: string;\n  name: string;\n  createdAt: Date;\n}\n\nconst userSchema = new Schema<IUser>({\n  email: { type: String, required: true, unique: true },\n  password: { type: String, required: true },\n  name: { type: String, required: true },\n  createdAt: { type: Date, default: Date.now },\n});\n\nexport const User = model<IUser>('User', userSchema);`,
      ),
      ...textChunks("\n\nリセットトークンモデルを作成します。\n\n"),
      ...editFileCall(
        "/src/models/reset-token.model.ts",
        "",
        `import { Schema, model, Document } from 'mongoose';\n\nexport interface IResetToken extends Document {\n  userId: string;\n  token: string;\n  expiresAt: Date;\n}\n\nconst resetTokenSchema = new Schema<IResetToken>({\n  userId: { type: String, required: true, index: true },\n  token: { type: String, required: true, unique: true },\n  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },\n});\n\nexport const ResetToken = model<IResetToken>('ResetToken', resetTokenSchema);`,
      ),
      ...textChunks("\n\nサービスを実装します。\n\n"),
      ...editFileCall(
        "/src/services/password-reset.service.ts",
        "",
        `import crypto from 'crypto';\nimport { ResetToken } from '../models/reset-token.model';\nimport { User } from '../models/user.model';\nimport { EmailService } from './email.service';\nimport { hash } from 'bcrypt';\n\nexport class PasswordResetService {\n  constructor(private emailService: EmailService) {}\n\n  async requestReset(email: string): Promise<void> {\n    const user = await User.findOne({ email });\n    if (!user) return; // Don't reveal if user exists\n\n    const token = crypto.randomBytes(32).toString('hex');\n    await ResetToken.create({\n      userId: user.id,\n      token,\n      expiresAt: new Date(Date.now() + 3600000), // 1 hour\n    });\n\n    await this.emailService.sendPasswordReset(email, token);\n  }\n\n  async resetPassword(token: string, newPassword: string): Promise<void> {\n    const resetToken = await ResetToken.findOne({ token });\n    if (!resetToken) throw new Error('Invalid or expired token');\n\n    const hashedPassword = await hash(newPassword, 12);\n    await User.findByIdAndUpdate(resetToken.userId, { password: hashedPassword });\n    await ResetToken.deleteOne({ _id: resetToken._id });\n  }\n}`,
      ),
      ...bashCall(
        "npm test",
        "> my-project@1.0.0 test\n> jest\n\n PASS  tests/auth.test.ts\n PASS  tests/user.test.ts\n PASS  tests/password-reset.test.ts\n\nTest Suites: 3 passed, 3 total\nTests:       11 passed, 11 total\nTime:        2.456s",
      ),
      ...textChunks(
        "\n\nパスワードリセット機能を実装しました:\n\n1. **ResetToken モデル** - TTLインデックス付きのトークンストレージ\n2. **PasswordResetService** - リセットリクエストとパスワード更新のロジック\n3. テストもすべてパスしています",
      ),
      { event: "done", data: {}, delay: 100 },
    ]
  }

  // Default: simple conversational response with a file read
  return [
    ...textChunks("承知しました。まずプロジェクトの構造を確認します。\n\n"),
    ...readFileCall(
      "/src/app.ts",
      `import express from 'express';\nimport { authRouter } from './controllers/auth.controller';\nimport { userRouter } from './controllers/user.controller';\nimport { logger } from './utils/logger';\n\nconst app = express();\n\napp.use(express.json());\napp.use('/api/auth', authRouter);\napp.use('/api/users', userRouter);\n\napp.listen(3000, () => {\n  logger.info('Server started on port 3000');\n});`,
    ),
    ...textChunks(
      "\n\nプロジェクトの構成を確認しました。Express.jsベースのAPIサーバーで、認証とユーザー管理のエンドポイントが実装されています。\n\n何か具体的な作業はありますか？",
    ),
    { event: "done", data: {}, delay: 100 },
  ]
}
