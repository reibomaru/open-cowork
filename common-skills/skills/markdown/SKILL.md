---
name: markdown
description: Markdown ドキュメントの作成・整形・他形式への変換を行う。記事や仕様書のドラフト作成、Office フォーマットへのエクスポート、目次生成に利用する。
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
