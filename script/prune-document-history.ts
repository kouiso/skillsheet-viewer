// 版履歴の保存期限処理（2026-10-14 決定、#564）の実行入口。
// 既定は dry-run で、削除候補の件数と bytes だけを出力する（本文・sheet_id は出さない）。
// --apply を明示したときだけ削除する。実行には管理接続の DATABASE_URL を渡す。
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { createDb } from '../src/db/client';
import {
  RETENTION_HISTORY_LIMIT_BYTES,
  RETENTION_HISTORY_WARN_BYTES,
  resolveFullDays,
} from '../src/db/document-history-retention';

export function parsePruneDocumentHistoryArgs(args: string[]): { apply: boolean; now: Date } {
  let apply = false;
  let now: Date | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--apply' && !apply) {
      apply = true;
      continue;
    }
    if (arg === '--now' && now === undefined) {
      const value = args[index + 1];
      index += 1;
      const parsed = value ? Date.parse(value) : Number.NaN;
      if (!Number.isFinite(parsed)) throw new Error('INVALID_NOW_ARGUMENT');
      now = new Date(parsed);
      continue;
    }
    throw new Error('INVALID_PRUNE_ARGUMENTS');
  }
  return { apply, now: now ?? new Date() };
}

function firstRow(result: unknown): Record<string, unknown> {
  const rows = Array.isArray(result) ? result : (result as { rows: unknown[] }).rows;
  const row = rows[0];
  if (row === null || typeof row !== 'object') throw new Error('INVALID_DB_RESPONSE');
  return row as Record<string, unknown>;
}

export async function executePruneDocumentHistory(args: string[], databaseUrl: string | undefined) {
  const { apply, now } = parsePruneDocumentHistoryArgs(args);
  if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED');
  const db = createDb(databaseUrl);
  try {
    const size = Number(
      firstRow(await db.execute(sql`SELECT pg_total_relation_size('public.document_versions') AS bytes`)).bytes,
    );
    if (!Number.isFinite(size)) throw new Error('INVALID_DB_RESPONSE');
    const fullDays = resolveFullDays(size);
    const result = firstRow(
      await db.execute(
        sql`SELECT skillsheet_private.prune_document_history(${now.toISOString()}::timestamptz, ${fullDays}::integer, ${!apply}::boolean) AS result`,
      ),
    ).result;
    if (result === null || typeof result !== 'object') throw new Error('INVALID_DB_RESPONSE');
    return {
      dryRun: !apply,
      historyBytes: size,
      overWarn: size > RETENTION_HISTORY_WARN_BYTES,
      overLimit: size > RETENTION_HISTORY_LIMIT_BYTES,
      fullDays,
      ...(result as Record<string, unknown>),
    };
  } finally {
    await db.$client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  executePruneDocumentHistory(process.argv.slice(2), process.env.DATABASE_URL)
    .then((result) => {
      // 容量警告は stdout の JSON に混ぜず stderr へ出す（件数・bytes だけを機械可読に残す）。
      if (result.overWarn) {
        console.error(
          `警告: 履歴容量 ${result.historyBytes} bytes が警告値 ${RETENTION_HISTORY_WARN_BYTES} bytes を超えています。`,
        );
      }
      console.log(JSON.stringify(result));
    })
    .catch((error: unknown) => {
      console.error('履歴の保存期限処理に失敗しました。接続先・適用状態・引数を確認してください。', error);
      process.exitCode = 1;
    });
}
