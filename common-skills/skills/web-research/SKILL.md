---
name: web-research
description: Web ページから情報を取得して要約・整形する。URL リストの一括取得、記事本文の抽出、複数ソースのクロスチェックに利用する。
---

# Web リサーチスキル

Web 上の情報を取得・要約する。bash tool から `curl` / `lynx` などで取得し、本文抽出は Python (`markitdown` / `pandoc`) や Node.js で行う。

## 主な用途

- 仕様書・ブログ・公式ドキュメントの本文取得
- 複数 URL の比較・差分整理
- 引用元 (URL と取得日) を必ず明示するレポート作成

## 推奨手順

1. `curl -sSL <URL>` で HTML を取得し、ファイルに保存。
2. `pandoc -f html -t markdown` か `markitdown` で本文を Markdown 化。
3. 必要箇所だけ抜粋し、引用元 URL を付けて応答にまとめる。

## 注意

- ログインが必要なサイトはスコープ外。
- レート制限とサイトの利用規約を尊重すること。
