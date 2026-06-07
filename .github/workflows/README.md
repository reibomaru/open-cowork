# GitHub Actions Workflows

CI 用のワークフロー。本番デプロイ用パイプラインは含めていない。

## ワークフロー

| ファイル | トリガー | 用途 |
|---|---|---|
| `lint.yml`        | PR / push (main, develop) | Biome による lint / format / check |
| `test-server.yml` | server/** 配下を含む PR / push | Hono API のユニット + E2E テスト |

## 必要な GitHub Secrets / Variables

CI は外部リソースに依存しないため、現状 secrets / variables の事前設定は不要。
