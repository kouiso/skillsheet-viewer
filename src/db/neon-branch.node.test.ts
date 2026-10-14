/**
 * M10: Neon 隔離ブランチ上での切断耐性と同版並行保存の検証。
 *
 * 接続先は `M10_NEON_BRANCH_URL` のみ。未設定の環境（CI）は skip し、
 * `DATABASE_URL` を含む他のDBへは決して接続しない。
 * suspend 中のブランチは最初の接続で起き直すため、通常テストより長い timeout を取る。
 */
import { randomUUID } from 'node:crypto';
import { neonConfig, Pool } from '@neondatabase/serverless';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ws from 'ws';

import { createDb, type Database } from './client';
import { createDocumentService, DocumentError } from './document-service';

if (!neonConfig.webSocketConstructor) {
  neonConfig.webSocketConstructor = ws;
}

const url = process.env.M10_NEON_BRANCH_URL;
const NEON_TIMEOUT = 180_000;

describe.skipIf(!url)('Neon branch save path (M10_NEON_BRANCH_URL)', () => {
  let db: Database;
  let pool: Pool;
  let owner: string;
  const createdSheetIds: string[] = [];

  beforeAll(async () => {
    db = createDb(url as string);
    pool = new Pool({ connectionString: url, max: 4 });
    // 実行 principal（URL の role）の owner をブランチ側から引く。owner_id はハードコードしない。
    const { rows } = await pool.query<{ owner_id: string }>(
      'SELECT owner_id FROM skillsheet_private.principals WHERE login_name = current_user',
    );
    if (!rows[0]?.owner_id) throw new Error('M10_NEON_BRANCH_URL の role が principals に未登録');
    owner = rows[0].owner_id;
  }, NEON_TIMEOUT);

  afterAll(async () => {
    // 作成したfixtureは実経路で消す（失敗してもブランチは使い捨てなので継続する）。
    const svc = createDocumentService(db, owner);
    for (const sheetId of createdSheetIds) {
      try {
        const read = await svc.read(sheetId);
        if (read.status === 'OK') await svc.delete(sheetId, read.snapshot.revision);
      } catch {
        /* cleanup best-effort */
      }
    }
    const client = (db as unknown as { $client?: Pool }).$client;
    await client?.end().catch(() => undefined);
    await pool.end().catch(() => undefined);
  });

  it(
    'トランザクション途中で自backendが切断されても部分書き込みは残らない',
    async () => {
      const marker = `m10-disconnect-probe-${randomUUID()}`;
      const victim = await pool.connect();
      try {
        await victim.query('BEGIN');
        await victim.query(
          "INSERT INTO skillsheet_private.principals (login_name, owner_id) VALUES ($1, 'm10-probe-owner')",
          [marker],
        );
        const { rows: pidRows } = await victim.query<{ pg_backend_pid: number }>(
          'SELECT pg_backend_pid()',
        );
        const pid = pidRows[0].pg_backend_pid;
        const { rows: term } = await pool.query<{ ok: boolean }>(
          'SELECT pg_terminate_backend($1) AS ok',
          [pid],
        );
        expect(term[0].ok).toBe(true);
        // backend が殺れた接続では COMMIT も次の問い合わせも失敗する
        await expect(victim.query('COMMIT')).rejects.toThrow();
      } finally {
        victim.release();
      }
      const { rows } = await pool.query<{ c: number }>(
        'SELECT count(*)::int AS c FROM skillsheet_private.principals WHERE login_name = $1',
        [marker],
      );
      expect(rows[0].c).toBe(0);
    },
    NEON_TIMEOUT,
  );

  it(
    '同じ expectedRevision の並行保存は1件だけ成功し残りは CONFLICT',
    async () => {
      const svc = () => createDocumentService(db, owner);
      const sheetId = randomUUID();
      await svc().create(sheetId, 'm10 concurrent fixture', []);
      createdSheetIds.push(sheetId);

      const [a, b] = await Promise.allSettled([
        svc().replace(sheetId, '0', 'm10 concurrent writer A', []),
        svc().replace(sheetId, '0', 'm10 concurrent writer B', []),
      ]);
      const settled = [a, b];
      const ok = settled.filter((r) => r.status === 'fulfilled');
      const conflicts = settled.filter(
        (r) => r.status === 'rejected' && r.reason instanceof DocumentError && r.reason.code === 'CONFLICT',
      );
      expect(ok).toHaveLength(1);
      expect(conflicts).toHaveLength(1);
      expect(ok[0].status === 'fulfilled' && ok[0].value.revision).toBe('1');

      const final = await svc().read(sheetId);
      expect(final.status).toBe('OK');
      if (final.status === 'OK') {
        expect(final.snapshot.revision).toBe('1');
        expect(['m10 concurrent writer A', 'm10 concurrent writer B']).toContain(final.snapshot.title);
      }
    },
    NEON_TIMEOUT,
  );
});
