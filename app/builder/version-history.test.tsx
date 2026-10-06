import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentSnapshot } from '@/db/document-service';
import { documentDifferences, VersionHistory, type VersionHistoryApi } from './version-history';

vi.mock('@/component/skill-sheet-viewer', () => ({ default: () => <p>全シート描画</p> }));
const snapshot = (revision: string, editable = true): DocumentSnapshot => ({
  sheetId: 'sheet',
  title: '合成文書',
  revision,
  blocks: [{ id: 'block', type: 'markdown', order: 0, data: { markdown: `本文${revision}\n\n` } }],
  validation: { editable, issues: editable ? [] : [{ blockId: 'block', path: 'data.future', code: 'UNKNOWN_FIELD' }] },
});
function setup(overrides: Partial<VersionHistoryApi> = {}, editable = true, restoreBlockedReason?: string) {
  const api = {
    list: vi.fn().mockResolvedValue(
      ['2', '1'].map((revision) => ({
        revision,
        title: '合成',
        recordedAt: '2026-10-06T00:00:00Z',
        action: 'save',
        restoredFrom: null,
        restoredBefore: null,
      })),
    ),
    read: vi.fn().mockImplementation(async (revision) => snapshot(revision)),
    previewRestore: vi.fn().mockImplementation(async (target, expected) => ({
      current: snapshot(expected),
      target: snapshot(target),
      newlyVisible: [
        {
          blockId: 'block',
          companyId: 'company',
          company: '公開される会社',
          projectId: 'project',
          project: '公開される案件',
        },
      ],
      visibilityUncertain: false,
      confirmation: 'a'.repeat(64),
      canRestore: true,
      laterRevisionCount: '9007199254740993',
    })),
    restore: vi.fn().mockResolvedValue({ snapshot: snapshot('3'), undoRevision: '2', undoAvailable: true }),
    ...overrides,
  };
  const onReload = vi.fn(),
    onRestored = vi.fn();
  render(
    <VersionHistory
      title="合成"
      currentRevision="2"
      currentEditable={editable}
      restoreBlockedReason={restoreBlockedReason}
      referenceMonth={24321}
      api={api}
      onClose={vi.fn()}
      onReload={onReload}
      onRestored={onRestored}
    />,
  );
  return { api, onReload, onRestored };
}
async function selectOld() {
  fireEvent.click(await screen.findByRole('button', { name: /版 1/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'この版に戻す' })).toBeEnabled());
}
async function confirmOld() {
  await selectOld();
  fireEvent.click(screen.getByRole('button', { name: 'この版に戻す' }));
  return await screen.findByRole('alertdialog');
}
describe('シート全体の版の履歴', () => {
  it('旧版の行選択では現在版との差分へ切り替え、任意比較selectも維持する', async () => {
    setup();
    await selectOld();
    expect(screen.getByRole('combobox', { name: '比較元' })).toHaveValue('2');
    expect(screen.getByRole('combobox', { name: '比較先' })).toHaveValue('1');
    expect(screen.getByText(/差分 1項目/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: '比較元' }), { target: { value: '1' } });
    await screen.findByText('内容は同じです。');
    expect(screen.getByRole('combobox', { name: '比較元' })).toHaveValue('1');
  });

  it('再読込後も履歴の復元前リンクが残り、復元した版を期待版に固定する', async () => {
    const { api } = setup({
      list: vi.fn().mockResolvedValue([
        {
          revision: '3',
          title: '合成',
          recordedAt: '2026-10-06T00:00:00Z',
          action: 'restore',
          restoredFrom: '1',
          restoredBefore: '2',
        },
      ]),
    });
    fireEvent.click(await screen.findByRole('button', { name: '版 3 の復元前（版 2）を確認' }));
    await waitFor(() => expect(api.previewRestore).toHaveBeenCalledWith('2', '3'));
  });

  it('未保存入力のguardは比較を許可し、復元開始を禁止する', async () => {
    const { api } = setup({}, true, '未保存の入力があります。履歴を閉じ、保存してから復元してください。');
    fireEvent.click(await screen.findByRole('button', { name: /版 1/ }));
    await screen.findByRole('button', { name: '選択した版の全体プレビュー' });
    expect(screen.getByRole('button', { name: 'この版に戻す' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'この版に戻す' }));
    expect(api.previewRestore).not.toHaveBeenCalled();
    expect(api.restore).not.toHaveBeenCalled();
    expect(screen.getByText(/未保存の入力があります/)).toBeInTheDocument();
  });
  it('現在が未知版でも有効な過去版を確認して復元できる', async () => {
    const { api } = setup(
      {
        read: vi.fn().mockImplementation(async (rev) => snapshot(rev, rev !== '2')),
        previewRestore: vi.fn().mockResolvedValue({
          current: snapshot('2', false),
          target: snapshot('1'),
          newlyVisible: [],
          visibilityUncertain: true,
          confirmation: 'a'.repeat(64),
          canRestore: true,
          sameContent: false,
          laterRevisionCount: '1',
        }),
      },
      false,
    );
    const dialog = await confirmOld();
    expect(within(dialog).queryByText(/あとから戻せます/)).not.toBeInTheDocument();
    expect(
      within(dialog).getByText('復元前の内容は履歴に残りますが、現在の入力ルールでは戻せません。'),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '戻す' }));
    await waitFor(() =>
      expect(api.restore).toHaveBeenCalledWith(expect.objectContaining({ targetRevision: '1', expectedRevision: '2' })),
    );
  });

  it('順序・未知項目・空白の差分を隠さない', () => {
    const result = documentDifferences({ items: ['A', 'B'], future: 'x\n' }, { items: ['B', 'A'], future: 'x\n\n' });
    expect(result.map((x) => x.path)).toEqual(['文書.items.0', '文書.items.1', '文書.future']);
    expect(result[2].after).toBe(JSON.stringify('x\n\n'));
  });
  it('確認前に復元せず、全公開対象・巨大件数と安全側の初期focusを表示する', async () => {
    const { api } = setup();
    const dialog = await confirmOld();
    expect(api.restore).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/9007199254740993/)).toBeInTheDocument();
    expect(within(dialog).getByText(/公開される会社/)).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'やめる' })).toHaveFocus());
    fireEvent.click(within(dialog).getByRole('button', { name: '戻す' }));
    await waitFor(() =>
      expect(api.restore).toHaveBeenCalledWith({
        targetRevision: '1',
        expectedRevision: '2',
        confirmation: 'a'.repeat(64),
      }),
    );
  });
  it('復元失敗後に同じ確認tokenで再試行できる', async () => {
    const restore = vi
      .fn()
      .mockRejectedValueOnce(Error('network'))
      .mockResolvedValue({ snapshot: snapshot('3'), undoRevision: '2', undoAvailable: true });
    setup({ restore });
    const dialog = await confirmOld();
    fireEvent.click(within(dialog).getByRole('button', { name: '戻す' }));
    fireEvent.click(await screen.findByRole('button', { name: '再試行' }));
    await waitFor(() => expect(restore).toHaveBeenCalledTimes(2));
    expect(restore.mock.calls[1]).toEqual(restore.mock.calls[0]);
  });
  it('復元中の二重送信と離脱を防ぐ', async () => {
    const restore = vi.fn(() => new Promise<never>(() => {}));
    setup({ restore });
    const dialog = await confirmOld();
    fireEvent.click(within(dialog).getByRole('button', { name: '戻す' }));
    expect(screen.getByRole('button', { name: '復元中…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'やめる' })).toBeDisabled();
    expect(restore).toHaveBeenCalledTimes(1);
  });
  it('競合は再読込を促し勝手に再復元しない', async () => {
    const restore = vi.fn().mockRejectedValue(Error('CONFLICT'));
    const { onReload } = setup({ restore });
    const dialog = await confirmOld();
    fireEvent.click(within(dialog).getByRole('button', { name: '戻す' }));
    fireEvent.click(await screen.findByRole('button', { name: '最新を読み込む' }));
    expect(onReload).toHaveBeenCalledOnce();
    expect(restore).toHaveBeenCalledOnce();
  });
  it('Undoも復元直後の版を期待版として確認し、後続更新との競合を無視しない', async () => {
    const { api } = setup();
    const dialog = await confirmOld();
    fireEvent.click(within(dialog).getByRole('button', { name: '戻す' }));
    fireEvent.click(await screen.findByRole('button', { name: '通知を閉じる' }));
    fireEvent.click(screen.getByRole('button', { name: '復元前の版 2 を確認' }));
    await waitFor(() => expect(api.previewRestore).toHaveBeenLastCalledWith('2', '3'));
  });
  it('未知版は原文を閲覧できるが復元できない', async () => {
    setup({ read: vi.fn().mockImplementation(async (rev) => snapshot(rev, rev !== '1')) });
    fireEvent.click(await screen.findByRole('button', { name: /版 1/ }));
    await screen.findByText(/この版は今の入力ルールに合わないため戻せません/);
    expect(screen.getByRole('button', { name: 'この版に戻す' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '選択した版の全体プレビュー' }));
    expect(screen.getByText(/data.future: UNKNOWN_FIELD/)).toBeInTheDocument();
    expect(screen.getByText(/"markdown": "本文1/)).toBeInTheDocument();
  });
  it('履歴取得失敗を再試行し、一版のみなら復元禁止', async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(Error('network'))
      .mockResolvedValue([
        {
          revision: '2',
          title: '合成',
          recordedAt: '2026-10-06T00:00:00Z',
          action: 'save',
          restoredFrom: null,
          restoredBefore: null,
        },
      ]);
    setup({ list });
    fireEvent.click(await screen.findByRole('button', { name: '履歴を再読み込み' }));
    await screen.findByText(/版が1つしかありません/);
    expect(screen.getByRole('combobox', { name: '比較元' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'この版に戻す' })).toBeDisabled();
  });
  it('読み込みが遅い旧選択の応答で現在の版を上書きしない', async () => {
    let finish!: (v: DocumentSnapshot) => void;
    let count = 0;
    setup({
      read: vi.fn().mockImplementation(async (rev) => {
        if (rev === '1' && ++count === 1)
          return new Promise<DocumentSnapshot>((resolve) => {
            finish = resolve;
          });
        return snapshot(rev);
      }),
    });
    await screen.findByRole('button', { name: /版 1/ });
    fireEvent.click(screen.getByRole('button', { name: /版 1/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'この版に戻す' })).toBeEnabled());
    finish(snapshot('2'));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '比較先' })).toHaveValue('1'));
  });
});
