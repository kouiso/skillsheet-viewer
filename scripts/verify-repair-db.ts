// 隔離DB検証専用。任意の外部DBへ接続せず、指定Unixソケットだけに転送する。
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { canonicalJson } from '../src/db/document-contract';
import { createDocumentService } from '../src/db/document-service';
import { applyPeriodRepair } from './apply-period-repair';
import { approvePeriodRepair } from './approve-period-repair';
import { startIsolatedDbBridge } from './isolated-db-bridge';
import { recordPeriodRepairApproval } from './period-repair-approval';
import { executePeriodRepairCommand } from './period-repair-command';
import { proposePeriodRepair } from './period-repair-proposal';
import { preparePeriodRepair } from './prepare-period-repair';
import { persistRepairProposal } from './repair-proposal-file';
import { resumePeriodRepair } from './resume-period-repair';
import { revertPeriodRepair } from './revert-period-repair';
import { runPeriodRepair } from './run-period-repair';

async function main() {
  const directory = process.argv[2];
  if (!directory || !isAbsolute(directory)) throw new Error('PRIVATE_SOCKET_DIRECTORY_REQUIRED');
  const bridge = await startIsolatedDbBridge(directory);
  neonConfig.wsProxy = () => bridge.endpoint;
  neonConfig.useSecureWebSocket = false;
  neonConfig.forceDisablePgSSL = true;
  neonConfig.pipelineConnect = false;
  const pool = new Pool({
    connectionString: 'postgresql://cas_runtime@localhost/postgres',
    connectionTimeoutMillis: 5000,
  });
  try {
    for (const mode of ['import', 'require']) {
      const script =
        mode === 'import'
          ? "const { Pool } = await import('@neondatabase/serverless');"
          : "const { createRequire } = await import('node:module'); const { Pool } = createRequire(process.cwd() + '/package.json')('@neondatabase/serverless');";
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          '--import',
          './scripts/isolated-neon-preload.mjs',
          '--input-type=module',
          '-e',
          script +
            "const pool = new Pool({ connectionString: process.env.DATABASE_URL }); try { console.log((await pool.query('select current_user as name')).rows[0].name); } finally { await pool.end(); }",
        ],
        {
          cwd: process.cwd(),
          timeout: 10000,
          env: {
            NODE_ENV: 'test',
            ISOLATED_NEON_PROXY: bridge.endpoint,
            DATABASE_URL: 'postgresql://cas_runtime@localhost/postgres',
          },
        },
      );
      assert.equal(stdout.trim(), 'cas_runtime');
    }
    const db = drizzle(pool);
    const reader = createDocumentService(db, 'cas-proof');
    const before = await reader.read('00000000-0000-4000-8000-000000000081');
    const out = join(directory, 'repair-proposal.json');
    const result = await preparePeriodRepair(reader, 'cas-proof', '00000000-0000-4000-8000-000000000081', out);
    const saved = JSON.parse(readFileSync(out, 'utf8'));
    if (result.approved || saved.owner !== 'cas-proof' || saved.expectedRevision !== '0')
      throw new Error('INVALID_PROPOSAL');
    if (
      result.changes !== 1 ||
      result.remainingIssues !== 0 ||
      saved.changes[0]?.field !== 'ongoing' ||
      saved.blocks[0]?.data.items[0]?.ongoing !== false ||
      saved.blocks[0]?.data.items[0]?.period !== '2026.08 — ' ||
      saved.blocks[0]?.data.items[0]?.duration !== '本人原文'
    )
      throw new Error('WRONG_REPAIR_DIFF');
    const after = await reader.read('00000000-0000-4000-8000-000000000081');
    if (canonicalJson(before) !== canonicalJson(after)) throw new Error('DRY_RUN_CHANGED_DATABASE');
    if (before.status !== 'OK') throw new Error('MISSING_BEFORE');
    const approval = recordPeriodRepairApproval(
      join(directory, 'synthetic-approval.json'),
      'cas-proof',
      before.snapshot,
      saved,
      saved,
    );
    // 合成承認の各束縛を壊しても、版・本文ともに変更されないことを実DBで確認する。
    for (const invalidApproval of [
      { ...approval, owner: 'other-owner' },
      { ...approval, sheetId: '00000000-0000-4000-8000-000000000099' },
      { ...approval, expectedRevision: '1' },
      { ...approval, beforeHash: 'wrong' },
      { ...approval, afterHash: 'wrong' },
      { ...approval, changes: [] },
    ]) {
      await assert.rejects(applyPeriodRepair(db, 'cas-proof', saved, invalidApproval), /REPAIR_APPROVAL_MISMATCH/);
      assert.equal(canonicalJson(await reader.read(saved.sheetId)), canonicalJson(before));
    }
    const rollback = new Error('ROLLBACK_SYNTHETIC_REPAIR');
    try {
      await db.transaction(async (tx) => {
        const journal = join(directory, 'repair-journal');
        mkdirSync(journal, { mode: 0o700 });
        const repaired = await runPeriodRepair(tx, journal, 'cas-proof', before.snapshot, saved, approval);
        // DB適用後、完了記録を失った状態を再現。再開時はrevisionを増やさない。
        unlinkSync(join(journal, 'db-applied.json'));
        const resumed = await runPeriodRepair(tx, journal, 'cas-proof', before.snapshot, saved, approval);
        assert.equal(canonicalJson(resumed), canonicalJson(repaired));
        assert.equal(JSON.parse(readFileSync(join(journal, 'before.json'), 'utf8')).snapshot.revision, '0');
        assert.equal(JSON.parse(readFileSync(join(journal, 'db-applied.json'), 'utf8')).revision, '1');
        if (!repaired.validation.editable || repaired.revision !== '1') throw new Error('REPAIR_NOT_APPLIED');
        // 適用後に古い承認を再送しても、新しい版を上書きしない。
        await assert.rejects(applyPeriodRepair(tx, 'cas-proof', saved, approval), /STALE_OR_CHANGED_REPAIR/);
        const reread = await createDocumentService(tx, 'cas-proof').read(saved.sheetId);
        assert.equal(canonicalJson(reread), canonicalJson({ status: 'OK', snapshot: repaired }));
        const later = await createDocumentService(tx, 'cas-proof').replace(
          repaired.sheetId,
          repaired.revision,
          repaired.title,
          repaired.blocks,
        );
        assert.equal(later.revision, '2');
        await assert.rejects(revertPeriodRepair(tx, journal, 'cas-proof'), /REPAIR_REVERT_CONFLICT/);
        await assert.rejects(
          runPeriodRepair(tx, journal, 'cas-proof', before.snapshot, saved, approval),
          /REPAIR_RESUME_CONFLICT/,
        );
        assert.equal(
          canonicalJson(await createDocumentService(tx, 'cas-proof').read(saved.sheetId)),
          canonicalJson({ status: 'OK', snapshot: later }),
        );
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    if (canonicalJson(await reader.read(saved.sheetId)) !== canonicalJson(before)) throw new Error('ROLLBACK_MISMATCH');
    const committedBefore = await reader.read('00000000-0000-4000-8000-000000000091');
    if (committedBefore.status !== 'OK') throw new Error('MISSING_COMMIT_FIXTURE');
    const commitJournal = join(directory, 'committed-journal');
    mkdirSync(commitJournal, { mode: 0o700 });
    const commitProposal = proposePeriodRepair('cas-proof', committedBefore.snapshot);
    const candidatePath = join(directory, 'commit-candidate.json');
    persistRepairProposal(candidatePath, commitProposal);
    await assert.rejects(
      approvePeriodRepair(reader, 'cas-proof', committedBefore.snapshot.sheetId, candidatePath, commitJournal, {
        beforeHash: commitProposal.beforeHash,
        afterHash: '0'.repeat(64),
      }),
      /REPAIR_APPROVAL_MISMATCH/,
    );
    const commitApproval = await approvePeriodRepair(
      reader,
      'cas-proof',
      committedBefore.snapshot.sheetId,
      candidatePath,
      commitJournal,
      commitProposal,
    );
    assert.equal(canonicalJson(await reader.read(committedBefore.snapshot.sheetId)), canonicalJson(committedBefore));
    const committed = await runPeriodRepair(
      db,
      commitJournal,
      'cas-proof',
      committedBefore.snapshot,
      commitProposal,
      commitApproval,
    );
    assert.equal(committed.revision, '1');
    unlinkSync(join(commitJournal, 'db-applied.json'));
    // 新しいPoolで別の接続を作り、実commit済みデータから再開する。
    const resumePool = new Pool({
      connectionString: 'postgresql://cas_runtime@localhost/postgres',
      connectionTimeoutMillis: 5000,
    });
    try {
      await assert.rejects(
        resumePeriodRepair(drizzle(resumePool), commitJournal, 'other-owner'),
        /REPAIR_OWNER_MISMATCH/,
      );
      for (const name of ['before.json', 'proposal.json', 'approved.json']) {
        const path = join(commitJournal, name);
        const original = readFileSync(path, 'utf8');
        try {
          writeFileSync(path, '{}');
          await assert.rejects(resumePeriodRepair(drizzle(resumePool), commitJournal, 'cas-proof'));
          assert.equal(
            canonicalJson(await reader.read(committed.sheetId)),
            canonicalJson({ status: 'OK', snapshot: committed }),
          );
        } finally {
          writeFileSync(path, original);
        }
      }
      const resumed = await resumePeriodRepair(drizzle(resumePool), commitJournal, 'cas-proof');
      assert.equal(canonicalJson(resumed), canonicalJson(committed));
      const commandArgs = [
        '--action',
        'resume',
        '--journal',
        commitJournal,
        '--owner',
        'cas-proof',
        '--sheet-id',
        committed.sheetId,
      ];
      await assert.rejects(
        executePeriodRepairCommand(
          commandArgs.map((value) => (value === committed.sheetId ? saved.sheetId : value)),
          undefined,
        ),
        /REPAIR_TARGET_MISMATCH/,
      );
      await assert.rejects(executePeriodRepairCommand(commandArgs, undefined), /DATABASE_URL_REQUIRED/);
      assert.deepEqual(await executePeriodRepairCommand(commandArgs, 'postgresql://cas_runtime@localhost/postgres'), {
        action: 'resume',
        sheetId: committed.sheetId,
        revision: '1',
      });
      assert.equal(JSON.parse(readFileSync(join(commitJournal, 'db-applied.json'), 'utf8')).revision, '1');
    } finally {
      await resumePool.end();
    }
    // 後続の単一文書CAS試験へ合成文書を残さない。限定APIで版付き削除する。
    const reverted = await revertPeriodRepair(db, commitJournal, 'cas-proof');
    assert.equal(reverted.revision, '2');
    assert.equal(canonicalJson(reverted.blocks), canonicalJson(committedBefore.snapshot.blocks));
    unlinkSync(join(commitJournal, 'reverted.json'));
    assert.equal(canonicalJson(await revertPeriodRepair(db, commitJournal, 'cas-proof')), canonicalJson(reverted));
    await assert.rejects(resumePeriodRepair(db, commitJournal, 'cas-proof'), /REPAIR_RESUME_CONFLICT/);
    await reader.delete(reverted.sheetId, reverted.revision);
    console.log('実commit・別接続で完了記録喪失後の再開・二重更新なし: PASS');
    console.log(
      '限定読取・修復案保存・承認適用・不一致6種拒否・古い承認拒否・完了記録喪失再開・後続版保護・試験transaction巻戻し: PASS',
    );
  } finally {
    await pool.end();
    await bridge.close();
  }
}
main().catch((error: unknown) => {
  console.error('隔離DB修復案検証: FAIL', error);
  process.exitCode = 1;
});
