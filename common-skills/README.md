# common-skills (local bind mount)

サーバ (pi-coding-agent) に共通スキルを供給するためのディレクトリ。
`docker-compose.yml` が `./common-skills` を `/mnt/open-cowork-common:ro` に bind mount し、
サーバが `WIZ_CLAUDE_COMMON_PLUGIN_PATH=/mnt/open-cowork-common` を `skillPaths` として
`pi-coding-agent` に渡す (`server/src/claude-agent.ts` 参照)。

## レイアウト

```
common-skills/
├── .claude-plugin/
│   └── plugin.json     ← マウント検出用マーカー (entrypoint の互換性で残置)
└── skills/
    └── <skill-name>/SKILL.md
```

## skill の投入

任意のディレクトリから `skills/` 配下にコピーするだけ。

```bash
DEST="$(git rev-parse --show-toplevel)/common-skills/skills"
cp -R /path/to/your-skill "$DEST/your-skill"
```

`docker compose up server` を再起動すると pi-coding-agent が拾う。

## 同梱スキル

リポジトリにはサンプルとして以下の基本スキルを含めている。各スキルは公式 [anthropics/skills](https://github.com/anthropics/skills) のレイアウト（薄い `SKILL.md` + トリガー検証用の `evals/evals.json`）に揃えている:

- `docx` … Word ドキュメント生成・編集
- `markdown` … Markdown 作成と他形式への変換
- `pdf` … PDF の読み取り / 生成 / 変換
- `pptx` … PowerPoint スライド生成
- `web-research` … Web 情報の取得・要約
- `xlsx` … Excel ワークブック編集と集計

不要な場合はディレクトリごと削除して、サーバを再起動すれば一覧から消える。
