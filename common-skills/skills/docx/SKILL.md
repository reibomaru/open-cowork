---
name: docx
description: Word (.docx) ドキュメントの生成・編集・読み取りを行う。議事録・契約書・レポートのテンプレート流用や、既存ファイルからのテキスト抽出に利用する。
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
