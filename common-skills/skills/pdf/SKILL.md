---
name: pdf
description: >
  PDF の読み取り・生成・変換を行うスキル。成果物または入力が PDF のときに使う。
  テキスト抽出、ページ画像化、HTML 帳票からの PDF 出力、Office ドキュメント (docx/pptx/xlsx) の PDF 化をカバー。
  トリガー例: 「この PDF から本文を抜き出して」「請求書を PDF で作って」「資料を PDF に変換して」
  「PDF をページごとに画像化して」「Word を PDF にして」「.pdf を読んで要約して」など、
  PDF/.pdf の言及や、帳票・印刷物を PDF 形式で求める依頼。
  near-miss（このスキルではない）:
  編集可能な Word が欲しいなら docx、スライドなら pptx、表計算なら xlsx。
  PDF 化が単なる最終工程で主役が元ファイルの編集なら、その元ファイルのスキルを優先する。
---

# PDF スキル

PDF ファイルの読み書きを行う。読み取りは `pdftotext` / `pdftoppm` (poppler-utils)、出力は Playwright (HTML → PDF) もしくは LibreOffice (Office → PDF) を使う。

## 主な用途

- 既存 PDF からのテキスト抽出 / ページごとの画像化
- HTML 帳票 (markdown + テンプレート) を PDF として書き出す
- docx / pptx / xlsx を PDF に変換

## 推奨ツール

| ツール | 用途 |
|--------|------|
| `pdftotext` | テキスト抽出 |
| `pdftoppm` | ページを png にレンダリング |
| Playwright (`page.pdf`) | サーバ側 API (`POST /api/export/pdf`) で HTML → PDF |
| `soffice --headless --convert-to pdf` | Office → PDF |

## 出力先

生成した .pdf は `workdir/` 配下に保存する。
