---
name: docx
description: >
  Word (.docx) ドキュメントの生成・編集・読み取りを行うスキル。成果物が Word ファイルのときに使う。
  トリガー例: 「Word で議事録を作って」「この内容を docx にして」「契約書テンプレートに差し込んで」
  「報告書を Word でほしい」「.docx からテキストを抜き出して」「見出しと目次つきの文書を作って」など、
  Word/ワード/.docx の言及や、レター・メモ・報告書・契約書を Word 形式で求める依頼。
  near-miss（このスキルではない）:
  表計算が主役なら xlsx、スライドなら pptx、PDF 出力が成果物なら pdf、
  プレーンな Markdown ドラフトなら markdown を使う。
---

# Word (docx) スキル

Microsoft Word ドキュメント (.docx) を扱う。生成は Node.js (`docx`) と Python (`python-docx`) のどちらでも可能。

## 主な用途

- 議事録・週報・レポート等の構造化ドキュメント生成
- 既存テンプレートの差し込み (フィールド置換)
- docx → Markdown のテキスト抽出 (`pandoc` を呼ぶ)

## 推奨ライブラリ

| 言語 | ライブラリ | 用途 |
|------|-----------|------|
| Node.js | `docx` | コードベースでのドキュメント組み立て |
| Python | `python-docx` | 既存 docx の段落・スタイル操作 |
| CLI | `pandoc` | docx ↔ md / pdf 等の相互変換 |

## 出力先

生成した .docx は `workdir/` 配下に保存する。
