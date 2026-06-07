---
name: pptx
description: PowerPoint (.pptx) ファイルを生成・編集する。新規スライド作成、既存ファイルへのスライド追加、テーマ・図形・テキストの差し替えに利用する。
---

# PowerPoint (pptx) スキル

PowerPoint プレゼンテーション (.pptx) を生成・編集する。Node.js (`pptxgenjs`) と Python (`python-pptx`) を利用できる。

## 主な用途

- 提案資料・会議資料のスライド生成 (タイトル・本文・箇条書き・表)
- 既存 pptx のテキスト差し替え・テンプレート流用
- Markdown / アウトラインからの一括スライド化

## 推奨ライブラリ

| 言語 | ライブラリ | 用途 |
|------|-----------|------|
| Node.js | `pptxgenjs` | ゼロからのスライド生成 (グローバルインストール済み) |
| Python | `python-pptx` | 既存テンプレートを開いて差分編集 |

## 出力先

生成した .pptx は `workdir/` 配下に保存する。
