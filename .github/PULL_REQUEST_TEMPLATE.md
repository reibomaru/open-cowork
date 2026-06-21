## 概要

<!-- 何を / なぜを箇条書きで。レビュアーがまず読む場所なので、diff を見なくても変更の意図が伝わるレベルで -->
-
-
-

## 主な変更

<!-- 規模が小さければ省略可。複数ファイルに渡る場合は表で整理すると見やすい
| ファイル | 内容 |
|---|---|
| `path/to/file.ts` | 何をしたか |
-->

## 依存追加

<!-- 任意。新しく追加した npm パッケージと用途。無ければ削除可
- `package-name` — 用途
-->

## 設計メモ

<!-- 任意。技術選定の理由 / トレードオフ / 採用しなかった案 / 既知の制約 など。コードからは読み取れない判断を残す -->

## スクリーンショット

<!--
UI 変更 (`client/src/**` の見た目・文言・レイアウト) を含む場合は必須。サーバ/インフラのみなら本節ごと削除可。
画像は PR コメント欄にドラッグ&ドロップ等でアップロードし、発行された user-attachments URL を貼る。
ケースに応じて下の A / B どちらかを使う（不要な方は削除）。
-->

<!-- A. 既存 UI を変更した場合: Before / After を並べる。状態が複数あるなら行を増やす
| 状態 | Before | After |
|---|---|---|
| Light | <img width="420" alt="before-light" src="URL" /> | <img width="420" alt="after-light" src="URL" /> |
| Dark | <img width="420" alt="before-dark" src="URL" /> | <img width="420" alt="after-dark" src="URL" /> |
-->

<!-- B. 新規 UI を追加した場合: 追加した UI を状態別に見せる
| 状態 | スクリーンショット |
|---|---|
| 通常 (Light) | <img width="660" alt="feature-light" src="URL" /> |
| 通常 (Dark) | <img width="660" alt="feature-dark" src="URL" /> |
| 操作中 / 展開時 | <img width="660" alt="feature-active" src="URL" /> |
| 空 / エラー状態 | <img width="660" alt="feature-empty" src="URL" /> |
-->

## 検証

<!-- レビュアー & 自分が確認すべき項目をチェックボックスで列挙 -->
- [ ] `pnpm check` (biome) クリーン
- [ ] `tsc -b` 型チェック通過
- [ ] `pnpm -F client build` 成功
- [ ] dev server / 実画面で動作確認
- [ ]

## スコープ外 / フォローアップ

<!-- 任意。本 PR では対応しない項目、別 PR で扱う TODO、既知の制約など -->

Closes #

🤖 Generated with [Claude Code](https://claude.com/claude-code)
