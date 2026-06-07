# Repository Guide

- `client/src/**` の UI 文言は i18n (`useT()` + `client/src/i18n/messages.ts` の ja/en) を使う。ハードコード禁止。
- アイコンのみのボタン/リンク（lucide-react などのアイコンをラベルなしで使うもの）は原則として `client/src/components/ui/Tooltip` でラップし、ツールチップを表示する。ラベルは i18n 経由で渡すこと。例外は付随テキストラベルが既にある場合のみ。
