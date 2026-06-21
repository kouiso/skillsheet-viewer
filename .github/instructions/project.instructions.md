---
applyTo: "**"
---

# プロジェクト共通ルール

- このリポジトリは Node.js 22.x / pnpm 10.x / TypeScript / Next.js 16 の pnpm workspaces モノレポです。
- AI エージェントは `AGENTS.md`、`CLAUDE.md`、`doc/` 配下の関連ドキュメントを前提に作業してください。
- コメント・ドキュメント・レビュー説明は日本語で記述してください。
- 依存関係の導入は pnpm を使い、npm/yarn の lockfile を追加しないでください。
- GitHub Actions の実行対象ワークフローは必ず `.github/workflows/` 配下に配置してください。
- 変更後は影響範囲に応じて `pnpm run lint`、`pnpm run type-check`、`pnpm run test`、`pnpm run build` を実行し、結果を確認してください。
