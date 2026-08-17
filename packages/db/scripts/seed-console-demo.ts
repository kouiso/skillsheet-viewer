/**
 * Console方向のダッシュボードUI（プロフィール/統計/スキルマトリクス/工程の俯瞰/案件詳細/タイムライン）
 * を実データで見た目確認するための検証用シートを1件 INSERT するスクリプト。
 *
 * 実行: pnpm --filter @skillsheet/db exec tsx scripts/seed-console-demo.ts
 */
import { createConsoleDemoSheet } from '../src/console-demo';
// .env.local のパース規則が2箇所に分かれると片方だけ直す退行が入るため、共通実装を使う。
import { loadWebEnvLocal } from './block-write';

async function main() {
  loadWebEnvLocal();
  const sheetId = await createConsoleDemoSheet();
  console.log('created sheetId:', sheetId);
  console.log(`URL: /view/db/${sheetId}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
