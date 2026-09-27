# AGENTS.md

## Overview
skillsheet-viewer - kouiso プロジェクト

## PDF 出力・閲覧・本番データ更新
本番 URL・閲覧コード・編集者ログイン・本番 DB の在処は `doc/onboarding.md` の「本番環境と接続先」、
PDF をローカルで出す手順と本番 DB のブロックを直す手順は `doc/pdf-export-and-data-update.md` にある。
依頼者にログインやボタン操作を頼む前に、必ず上の2か所を見る。

## Development

### Language & Frameworks
- Node.js / JavaScript/TypeScript

### Setup
```bash
pnpm install --frozen-lockfile
```

### Code Style
- 日本語でコメント・ドキュメントを記述
- 既存コードスタイルに従う

### Testing
```bash
pnpm test
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
