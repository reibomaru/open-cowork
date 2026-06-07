---
name: xlsx
description: Excel (.xlsx / .xlsm) を読み書きする。表データの集計・整形、ピボット風の縦持ち横持ち変換、テンプレートへの値差し込みに利用する。
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
