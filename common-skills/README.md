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

## git 管理ポリシー

- `.claude-plugin/plugin.json` と `skills/.gitkeep` のみコミットする
- 各 skill 本体 (`skills/<name>/`) は ignore
