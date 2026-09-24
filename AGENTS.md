# AGENTS.md

## Overview
skillsheet-viewer - kouiso プロジェクト

## PDF 出力・閲覧・本番データ更新
本番 URL・閲覧コード・編集者ログイン・本番 DB の在処は `doc/onboarding.md` の「本番環境と接続先」、
PDF をローカルで出す手順と本番 DB のブロックを直す手順は `doc/pdf-export-and-data-update.md` にある。
依頼者にログインやボタン操作を頼む前に、必ずここを見る。

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
