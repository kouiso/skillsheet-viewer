import { describe, expect, it, vi } from 'vitest';
import type { Database } from './client';
import { createDocumentHistory, visibleChanges } from './document-history';

const sheetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const blockId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const md = (text = '合成') => [{ id: blockId, type: 'markdown', order: 0, data: { markdown: text } }];
const ok = (revision: string, blocks: ReturnType<typeof md> | unknown[] = md()) => ({
  status: 'OK',
  snapshot: { sheetId, title: '合成シート', revision, blocks },
});
function harness(...values: unknown[]) {
  const execute = vi.fn();
  for (const result of values) execute.mockResolvedValueOnce({ rows: [{ result }] });
  return { execute, history: createDocumentHistory({ execute } as unknown as Pick<Database, 'execute'>, 'owner-a') };
}

describe('文書履歴', () => {
  it('不正な対象版はSQL復元へ渡さず、現在rawが不正でも比較できる', async () => {
    const invalid = [{ id: blockId, type: 'future', order: 0, data: { raw: '保持' } }];
    const { history, execute } = harness(ok('2', invalid), ok('1', invalid), '1');
    const preview = await history.previewRestore(sheetId, '1', '2');
    expect(preview.current.blocks).toEqual(invalid);
    expect(preview.visibilityUncertain).toBe(true);
    expect(preview.canRestore).toBe(false);
    const restore = harness(ok('2', md('現在の本文')), ok('1', invalid), '1');
    await expect(restore.history.restore(sheetId, '1', '2', preview.confirmation)).rejects.toMatchObject({
      code: 'UNEDITABLE_DOCUMENT',
    });
    expect(restore.execute).toHaveBeenCalledTimes(3);
    expect(execute).toHaveBeenCalledTimes(3);
  });
  it('巨大revisionを文字列で保持し、後続記録数は差の数値変換でなくDB件数を使う', async () => {
    const { history } = harness(ok('9007199254740993'), ok('1'), '2');
    const preview = await history.previewRestore(sheetId, '1', '9007199254740993');
    expect(preview.current.revision).toBe('9007199254740993');
    expect(preview.laterRevisionCount).toBe('2');
  });
  it('表示確認tokenを再計算し、確認前の競合と復元SQLでの競合を両方拒否する', async () => {
    const first = harness(ok('2', md('現在の本文')), ok('1'), '1');
    const preview = await first.history.previewRestore(sheetId, '1', '2');
    const wrong = harness(ok('2', md('現在の本文')), ok('1'), '1');
    await expect(wrong.history.restore(sheetId, '1', '2', '0'.repeat(64))).rejects.toMatchObject({
      code: 'VISIBILITY_CONFIRMATION_REQUIRED',
    });
    expect(wrong.execute).toHaveBeenCalledTimes(3);
    const stale = harness(ok('3'));
    await expect(stale.history.restore(sheetId, '1', '2', preview.confirmation)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(stale.execute).toHaveBeenCalledTimes(1);
    const race = harness(ok('2', md('現在の本文')), ok('1'), '1', { status: 'CONFLICT' });
    await expect(race.history.restore(sheetId, '1', '2', preview.confirmation)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
  it('版番号が違っても今のタイトルとrawが同じなら復元を無効にする', async () => {
    const { history } = harness(ok('4'), ok('1'), '3');
    expect(await history.previewRestore(sheetId, '1', '4')).toMatchObject({ canRestore: false, sameContent: true });
  });
  it('現在rawが不正でも正常版へ戻せるが、不正rawへのUndo可能とは返さない', async () => {
    const invalid = [{ id: blockId, type: 'future', order: 0, data: { raw: '保持' } }];
    const first = harness(ok('2', invalid), ok('1'), '1');
    const preview = await first.history.previewRestore(sheetId, '1', '2');
    const { history } = harness(ok('2', invalid), ok('1'), '1', ok('3'));
    expect(await history.restore(sheetId, '1', '2', preview.confirmation)).toMatchObject({
      snapshot: { revision: '3' },
      undoRevision: '2',
      undoAvailable: false,
    });
  });
  it('削除版は存在・確認・対象妥当性を確認し、同じ削除revisionでのみ復元する', async () => {
    const deleted = [{ sheetId, revision: '3', title: '合成シート', deletedAt: '2026-10-06T00:00:00Z' }];
    const first = harness(ok('3'), deleted);
    const preview = await first.history.previewDeleted(sheetId, '3');
    const { history } = harness(ok('3'), deleted, ok('4'));
    expect(await history.restoreDeleted(sheetId, '3', preview.confirmation)).toMatchObject({ revision: '4' });
    const stale = harness(ok('3'), []);
    await expect(stale.history.previewDeleted(sheetId, '3')).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('revision上限超過とページ件数超過をDB呼出前に拒否する', async () => {
    const { history, execute } = harness();
    await expect(history.read(sheetId, '9223372036854775808')).rejects.toMatchObject({ code: 'INVALID_REVISION' });
    await expect(history.list(sheetId, undefined, 21)).rejects.toMatchObject({ code: 'INVALID_LIMIT' });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('復元時の公開範囲', () => {
  function project(hiddenCompany = false, hiddenProject = false) {
    return [
      {
        id: blockId,
        type: 'project',
        order: 0,
        data: {
          companies: [{ id: 'c1', name: '合成会社', kind: 'client', period: '2024', note: '', hidden: hiddenCompany }],
          items: [
            {
              id: 'p1',
              companyId: 'c1',
              title: '合成案件',
              scope: '',
              period: '2024.01 — 2024.02',
              role: '',
              team: '',
              tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] },
              process: [],
              duties: '',
              acquired: '',
              comment: '',
              hidden: hiddenProject,
            },
          ],
        },
      },
    ];
  }
  it('会社の非表示を解除すると会社と配下の可視案件を警告する', () => {
    expect(visibleChanges(project(true), project())).toEqual([
      { blockId, companyId: 'c1', company: '合成会社' },
      { blockId, companyId: 'c1', company: '合成会社', projectId: 'p1', project: '合成案件' },
    ]);
  });
  it('会社が非表示のままなら案件を表示にしても公開されない', () => {
    expect(visibleChanges(project(true, true), project(true, false))).toEqual([]);
  });
  it('既に可視の項目は警告へ重複追加しない', () => {
    expect(visibleChanges(project(), project())).toEqual([]);
    expect(visibleChanges(project(false, true), project())).toHaveLength(1);
  });
});
