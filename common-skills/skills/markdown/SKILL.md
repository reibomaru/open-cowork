---
name: markdown
description: >
  Markdown (.md) ドキュメントの作成・整形・他形式への変換を行うスキル。成果物が Markdown のときに使う。
  トリガー例: 「README を書いて」「仕様書を md で作って」「この記事を Markdown にまとめて」
  「目次を生成して」「md を docx/pdf に変換して」「Office ファイルを Markdown に起こして」など、
  Markdown/md の言及や、軽量テキスト文書のドラフト・整形・相互変換の依頼。
  near-miss（このスキルではない）:
  最終成果物が Word なら docx、PDF なら pdf、スライドなら pptx。
  Web ページの取得・要約が目的なら web-research を使う。
---

# Markdown スキル

Markdown (.md) ドキュメントを扱う。記述は素の Markdown + GFM 拡張、変換は `pandoc` を中心に行う。

## 主な用途

- 仕様書 / 記事 / READMEのドラフト作成
- Markdown → docx / pdf / html への変換 (pandoc)
- 既存 md からの見出しツリー抽出・目次生成

## 推奨ツール

| ツール | 用途 |
|--------|------|
| `pandoc` | md ↔ docx / pdf / html 変換 |
| `markitdown` | docx / xlsx / pptx → md 抽出 (Python パッケージ) |

## 出力先

生成した .md は `workdir/` 配下に保存する。
