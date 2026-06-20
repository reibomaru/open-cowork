---
name: xlsx
description: >
  Excel (.xlsx / .xlsm) や CSV/TSV を読み書きするスキル。成果物または入力が表計算のときに使う。
  集計・整形、縦持ち横持ち変換、数式・書式を保ったテンプレートへの値差し込み、表データのクレンジングをカバー。
  トリガー例: 「この CSV を集計して xlsx にして」「Excel に列を追加して」「売上表をピボットして」
  「テンプレに数値を流し込んで」「散らかった表データを整形して」「.xlsx を読んで要約して」など、
  Excel/エクセル/スプレッドシート/.xlsx/.csv の言及や、表データの加工・集計の依頼。
  near-miss（このスキルではない）:
  文章主体の文書は docx、スライドは pptx、PDF 配布物は pdf。
  Google Sheets API 連携や DB パイプラインが主役なら本スキルではない。
---

# Excel (xlsx) スキル

Microsoft Excel ワークブックを操作する。集計と整形は Python (`openpyxl` / `pandas`) を、書式維持の編集は `openpyxl` を使う。

## 主な用途

- 表計算データ (CSV / TSV / xlsx) の読み込みと変換
- テンプレートシートへの値差し込み (数式・書式を維持)
- LibreOffice 経由での pdf 化 (印刷物向け)

## 推奨ライブラリ

| 言語 | ライブラリ | 用途 |
|------|-----------|------|
| Python | `openpyxl` | 既存 .xlsx のセル単位編集 |
| Python | `pandas` | データフレーム経由の集計・変換 |
| CLI | `soffice` (LibreOffice) | xlsx → pdf 変換 / 数式再計算 |

## 出力先

生成した .xlsx は `workdir/` 配下に保存する。
