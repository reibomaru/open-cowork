---
name: pdf
description: PDF を読み取り・生成する。テキスト抽出、ページ画像化、HTML からの PDF 出力 (Playwright)、Office ドキュメントの PDF 化 (LibreOffice) をカバーする。
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
