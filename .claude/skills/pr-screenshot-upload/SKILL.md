---
name: pr-screenshot-upload
description: >
  ローカルのスクリーンショット/画像を GitHub の PR・Issue にブラウザ操作で
  アップロードして本文に貼り付けるスキル。edge-cdp のログイン済み Edge で
  コメント欄に画像を投入し user-attachments のホスト URL を取得 → PR/Issue
  本文に追記する。`gh pr edit` が projects-classic 廃止エラーで失敗するため
  本文更新は REST API (gh api -X PATCH) を使う。
  トリガー例（カジュアル/フォーマル/間接表現を含む）:
  「PR にスクショ付けて」「この画像を PR に貼って」「Issue に画像を載せて」
  「動作確認のキャプチャを PR に添付して」「スクショをアップして本文に入れて」など。
  near-miss（このスキルではない）:
  - スクショを撮るだけ・ブラウザ操作だけは edge-cdp（本スキルはその撮影画像を
    GitHub にアップロードして本文へ貼るところまでを担当）。
  - 画像を伴わない PR 本文/タイトル編集は gh で直接（ただし projects-classic
    エラー回避のため本文は gh api -X PATCH を使う点は本スキルと同じ）。
---

# PR/Issue スクショ添付スキル

ローカル画像を GitHub PR/Issue に **ブラウザ操作で** アップロードし、本文へ貼り付ける。

GitHub の画像アップロード（`user-attachments`）は公開 API が無く、ログイン済み
ブラウザのコメント欄に画像を投入することでのみホスト URL が発行される。本スキルは
edge-cdp の隔離 Edge プロファイルを使ってこれを行う。

## 前提

- `edge-cdp` スキルで CDP 付き Edge が起動済み（`launch-edge.sh`）。
- その Edge プロファイル（`$HOME/.claude-edge-cdp-profile`）が **GitHub にログイン済み**。
  未ログインなら Edge で `https://github.com/login` を開いてユーザにログインしてもらう。
- 対象リポジトリが PUBLIC なら添付 URL は誰でも閲覧可。PRIVATE なら閲覧に認証が要る。
- スクリプトは playwright hoisting の都合で **必ず `client/` 配下で実行**する
  （理由は edge-cdp の references/why-client-dir.md と同じ）。

## 手順

### 1. 画像を用意

撮影は `edge-cdp`（`cdp-screenshot.mjs` や要素 `.screenshot()`）で行う。alt 文字列は
ファイル名がそのまま使われるので、意味のある ASCII 名にリネームしておくとよい
（例: `mic-button-enabled.png`）。

### 2. ブラウザ操作でアップロードして URL を取得

```bash
node .claude/skills/pr-screenshot-upload/scripts/gh-upload-attachment.mjs \
  "https://github.com/<owner>/<repo>/pull/<n>" \
  /tmp/mic-button-enabled.png /tmp/mic-tooltip-i18n.png
```

- コメント欄に画像を投入してアップロード完了を待ち、`user-attachments/assets/...` の
  URL を取得する。**コメントは投稿しない**（入力欄は最後にクリアする）。
- 出力の `ATTACHMENTS_JSON {...}` 行に `{alt,url,markdown}[]` が入る。未ログイン時は
  exit code 2 でログインを促す。
- cwd が `client/` でないと `node` の相対 import で失敗するので注意（絶対パス推奨）。

### 3. 取得した URL を本文へ追記

現在の本文を取得し、スクショ節を足して **REST API** で更新する
（`gh pr edit` / `gh issue edit` は projects-classic 廃止で GraphQL エラーになる）。

```bash
# PR の場合
gh api repos/<owner>/<repo>/pulls/<n> --jq '.body' > /tmp/body.md
cat >> /tmp/body.md <<'EOF'

## スクリーンショット
<img width="660" alt="mic-button-enabled" src="https://github.com/user-attachments/assets/XXXX" />
EOF
gh api -X PATCH repos/<owner>/<repo>/pulls/<n> -F body=@/tmp/body.md --jq '.html_url'

# Issue の場合は pulls/<n> を issues/<n> に置き換える
```

### 4. 確認

```bash
gh api repos/<owner>/<repo>/pulls/<n> --jq '.body' | grep -c "user-attachments/assets"
```

## 注意・既知の落とし穴

- **実マイク等が要る動的な状態は撮れない**。録音中/ライブ系の UI は自動操作環境では
  再現できないことがあるので、撮れない状態は本文に注記する。
- dev サーバーが別ワークツリーから起動していると旧コードを配信する。確認したい変更が
  反映された URL（ポート）かを撮影前に必ず確かめる（mic ボタン有無など要素で検証）。
- アップロードに使った Edge は閉じない（edge-cdp の原則）。ログインセッションも残す。

## 関連スキル

- `edge-cdp`: スクショ撮影・ブラウザ操作・ログイン（本スキルの前段）。
- `dev-server`: 確認対象を起動する（撮影前）。
