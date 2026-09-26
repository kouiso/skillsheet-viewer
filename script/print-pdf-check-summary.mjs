#!/usr/bin/env node
/**
 * 毎朝の PDF 検査（pdf-layout-check.yml）の公開ログ用サマリー。
 *
 * vitest --reporter=json の結果ファイルから「テスト名と成否」と、
 * 実データ検査が別ファイルへ書いた「規則ごとの件数」だけを拾って
 * 標準出力に出す。これら以外（assertion の失敗文・スタック・本文の
 * 文字列）は一時ファイルにだけ残し、このスクリプトは一切読まない。
 *
 * 使い方:
 *   node script/print-pdf-check-summary.mjs <vitest.json> [counts.json]
 *
 * 引数のファイルが無い・壊れているときは理由だけ出して終了する
 * （ワークフローの成否は vitest 自身の終了コードが決めるので、
 * ここで余計な失敗を足さない）。
 */
import { existsSync, readFileSync } from 'node:fs';

const [vitestJsonPath, countsJsonPath] = process.argv.slice(2);

if (!vitestJsonPath) {
  console.log('usage: node script/print-pdf-check-summary.mjs <vitest.json> [counts.json]');
  process.exit(0);
}

if (!existsSync(vitestJsonPath)) {
  console.log(`[pdf-check] vitest の結果ファイルがありません: ${vitestJsonPath}`);
} else {
  let report;
  try {
    report = JSON.parse(readFileSync(vitestJsonPath, 'utf-8'));
  } catch {
    console.log('[pdf-check] vitest の結果ファイルを読めませんでした');
  }
  if (report) {
    const results = Array.isArray(report.testResults) ? report.testResults : [];
    const assertions = results.flatMap((r) => (Array.isArray(r.assertionResults) ? r.assertionResults : []));
    const failed = assertions.filter((a) => a.status === 'failed');
    const skipped = assertions.filter((a) => a.status === 'skipped');
    console.log(
      `[pdf-check] tests: total=${assertions.length} passed=${assertions.length - failed.length - skipped.length} failed=${failed.length} skipped=${skipped.length}`,
    );
    for (const a of failed) {
      console.log(`[pdf-check] FAILED ${a.fullName ?? '(name unknown)'}`);
    }
  }
}

if (countsJsonPath && existsSync(countsJsonPath)) {
  try {
    const perTest = JSON.parse(readFileSync(countsJsonPath, 'utf-8'));
    for (const [testName, counts] of Object.entries(perTest)) {
      const parts = Object.entries(counts).map(([rule, n]) => `${rule}=${n}`);
      console.log(`[pdf-check] counts ${testName}: ${parts.join(' ')}`);
    }
  } catch {
    console.log('[pdf-check] 規則別件数ファイルを読めませんでした');
  }
}
