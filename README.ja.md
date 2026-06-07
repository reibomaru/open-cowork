# Open Cowork

[English / 英語版](./README.md)

[`@earendil-works/pi-coding-agent`](https://github.com/earendil-works/pi/tree/main/packages/coding-agent) を利用したセルフホスト型の AI アシスタントチャット。ブラウザから Claude と対話し、各セッションを「タスク」として整理し、再利用可能なワークフローを「スキル」としてスラッシュ 1 つで呼び出せます。

<p align="center">
  <img src="docs/screenshots/landing-light.png" alt="Open Cowork — ライトテーマ" width="900" />
  <br />
  <em>Welcome screen (ライト / ダークテーマ)</em>
  <br />
  <img src="docs/screenshots/landing-dark.png" alt="Open Cowork — ダークテーマ" width="900" />
</p>

## 主な機能

- 🧵 **タスク管理** — 1 会話 = 1 タスク。リネーム / アーカイブ / 再開できる。
- 🛠️ **スキル** — `SKILL.md` をプロジェクトに置けば `/skill-name` で呼び出せる。
- 📎 **添付ファイル** — PDF / 画像 / Office ドキュメントをドラッグで渡せる。
- 🎨 **HTML アーティファクト** — ` ```html` フェンスのブロックは横並びでライブプレビューされる。
- 🌗 **ライト / ダークテーマ** — モノクロデザインで邪魔をしない。

## クイックスタート

### 前提

- [Node.js 22+](https://nodejs.org/) と [pnpm 10+](https://pnpm.io/installation)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (チャット履歴用のローカル DynamoDB を起動するため)
- [Anthropic API キー](https://console.anthropic.com/) (エージェント応答に必要)

### 1. インストール

```bash
git clone https://github.com/reibomaru/open-cowork.git
cd open-cowork
pnpm install
```

### 2. 設定

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

`server/.env` を開いて API キーを入れる:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. 起動

```bash
pnpm dev
```

バックエンド (Docker) と Vite 開発サーバが立ち上がります。<http://localhost:5173> を開いてチャット開始。

## スキルの使い方

スキルは「再利用可能なシステムプロンプト」として読み込まれる Markdown ファイルです。`common-skills/skills/<name>/SKILL.md` に置けば次の送信から自動で認識されます。チャットでの呼び出し方:

```
/<skill-name> 続けて書きたいプロンプト
```

新規チャット画面の「使えるスキル」一覧にもクリックで挿入できる形で表示されます。

## 設定

主な設定は `server/.env` にまとまっています:

| 変数 | 用途 |
|------|------|
| `ANTHROPIC_API_KEY` | Anthropic API キー |
| `MODEL_PROVIDER` | 既定プロバイダ (`anthropic` / `amazon-bedrock` 等) |
| `DEV_USER_ID` | 認証ヘッダ未指定時のフォールバック userId |

全項目とコメントは `server/.env.example` を参照。

## ドキュメント

- [English README](./README.md)
- [開発者ガイド](./docs/DEVELOPMENT.ja.md) — 構成、プロジェクトレイアウト、スクリプトなど
- [`@earendil-works/pi-coding-agent`](https://github.com/earendil-works/pi/tree/main/packages/coding-agent) — 基盤になっているエージェントランタイム
