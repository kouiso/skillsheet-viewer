# Gemini 向けプロジェクト指示

このリポジトリで作業する Gemini / AI エージェントは、まず `AGENTS.md` と `CLAUDE.md` を読み、そこに記載された開発ルール・検証ルールに従ってください。

## 基本方針

- 日本語でコミュニケーション、コメント、ドキュメントを書く。
- pnpm workspaces のモノレポとして扱う。
- Node.js 22.x / pnpm 10.x を利用する。
- 変更後は `pnpm run lint`、`pnpm run type-check`、`pnpm run test`、`pnpm run build` のうち影響範囲に必要なものを実行し、実行結果を報告する。
- GitHub Actions のワークフローは `.github/workflows/` 配下に追加・更新する。

## 主要コマンド

```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm run type-check
pnpm run test
pnpm run build
```
