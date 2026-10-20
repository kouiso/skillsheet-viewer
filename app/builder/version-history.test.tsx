import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
      // 2分以上あけて、自動保存のまとまりにたたまれない2版にする。
      ['2', '1'].map((revision) => ({
        revision,
        title: '合成',
        recordedAt: `2026-10-06T00:${revision === '2' ? '10' : '00'}:00Z`,
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

  it('ブロック描画でも選択した版のシートタイトルを明示する', async () => {
    setup({
      read: vi
        .fn()
        .mockImplementation(async (revision) => ({ ...snapshot(revision), title: `版${revision}のタイトル` })),
    });
    fireEvent.click(await screen.findByRole('button', { name: /版 1/ }));
    fireEvent.click(await screen.findByRole('button', { name: '選択した版の全体プレビュー' }));
    expect(await screen.findByRole('heading', { name: '版1のタイトル' })).toBeVisible();
  });

  it('通常の復元確認は内容詳細を折りたたみ、開くと確認tokenの対象原文と差分を表示する', async () => {
    setup();
    const dialog = await confirmOld();
    const summary = within(dialog).getByText('戻す内容と変更点を確認');
    const details = summary.closest('details');
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(summary);
    expect(within(dialog).getByRole('heading', { name: '合成文書' })).toBeVisible();
    expect(within(dialog).getByText(/"markdown": "本文1/)).toBeInTheDocument();
    expect(within(dialog).getByText('いまの内容から変わる項目')).toBeVisible();
    expect(within(dialog).getByText(/本文2/, { selector: 'del' })).toBeVisible();
    expect(within(dialog).getByText(/本文1/, { selector: 'ins' })).toBeVisible();
  });

  it('比較ペインと異なる確認応答でも対象原文・差分・警告・復元tokenを混同しない', async () => {
    const { api } = setup({
      previewRestore: vi.fn().mockResolvedValue({
        current: { ...snapshot('9', false), title: '確認時の現在' },
        target: { ...snapshot('7'), title: '確認対象のタイトル' },
        newlyVisible: [
          {
            blockId: 'block',
            companyId: 'new-company',
            company: '確認対象の公開会社',
            projectId: 'new-project',
            project: '確認対象の公開案件',
          },
        ],
        visibilityUncertain: true,
        confirmation: 'b'.repeat(64),
        canRestore: true,
        laterRevisionCount: '8',
      }),
    });
    await selectOld();
    expect(screen.getByRole('combobox', { name: '比較元' })).toHaveValue('2');
    expect(screen.getByRole('combobox', { name: '比較先' })).toHaveValue('1');
    fireEvent.click(screen.getByRole('button', { name: 'この版に戻す' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(api.previewRestore).toHaveBeenCalledWith('1', '2');
    expect(api.restore).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/確認対象の公開会社/)).toBeVisible();
    expect(within(dialog).getByText('復元前の内容は履歴に残りますが、現在の入力ルールでは戻せません。')).toBeVisible();
    fireEvent.click(within(dialog).getByText('戻す内容と変更点を確認'));
    expect(within(dialog).getByRole('heading', { name: '確認対象のタイトル' })).toBeVisible();
    expect(within(dialog).getByText(/"markdown": "本文7/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/"markdown": "本文1/)).not.toBeInTheDocument();
    expect(within(dialog).getByText(/本文9/, { selector: 'del' })).toBeVisible();
    expect(within(dialog).getByText(/本文7/, { selector: 'ins' })).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: '戻す' }));
    await waitFor(() =>
      expect(api.restore).toHaveBeenCalledWith({
        targetRevision: '7',
        expectedRevision: '9',
        confirmation: 'b'.repeat(64),
      }),
    );
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
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('戻す内容と変更点を確認').closest('details')).toHaveAttribute('open');
    expect(within(dialog).getByRole('heading', { name: '合成文書' })).toBeVisible();
    expect(within(dialog).getByText(/本文2/, { selector: 'ins' })).toBeVisible();
    expect(api.restore).not.toHaveBeenCalled();
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
    const undoDialog = await screen.findByRole('alertdialog');
    expect(within(undoDialog).getByText('戻す内容と変更点を確認').closest('details')).toHaveAttribute('open');
    expect(within(undoDialog).getByText(/本文2/, { selector: 'ins' })).toBeVisible();
    expect(api.restore).toHaveBeenCalledTimes(1);
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

describe('自動保存のまとまり', () => {
  // 版4〜2 は30秒おきの自動保存、版1 は作成。新しい順で返す。
  const rows = [
    ['4', '00:01:00', 'save'],
    ['3', '00:00:30', 'save'],
    ['2', '00:00:00', 'save'],
    ['1', '23:50:00', 'create'],
  ].map(([revision, time, action]) => ({
    revision,
    title: '合成',
    recordedAt: `2026-10-0${time.startsWith('23') ? '5' : '6'}T${time}Z`,
    action,
    restoredFrom: null,
    restoredBefore: null,
  }));
  function setupGrouped() {
    return setup({ list: vi.fn().mockResolvedValue(rows) });
  }

  it('続けた保存を1行にたたみ、回数と版の範囲を出す', async () => {
    setupGrouped();
    const toggle = await screen.findByRole('button', { name: '版 2〜4 の内訳を開く' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/保存 3回 · 版 2〜4/)).toBeInTheDocument();
    // たたんでいる間は中の版の行を出さない。作成の版は1行のまま出す。
    expect(screen.queryByRole('button', { name: /^版 3/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^版 1/ })).toBeInTheDocument();
  });

  it('10分超の連続保存がページをまたいでも最新側を起点にまとめる', async () => {
    // 40件の自動保存を1.5分おきに並べ、1ページ20件で読む。
    // まとまりの起点は最新側なので、開いておいた最新のまとまりは「前の版を読み込む」でも閉じない。
    const many = Array.from({ length: 40 }, (_, i) => ({
      revision: String(40 - i),
      title: '合成',
      recordedAt: new Date(Date.parse('2026-10-06T00:00:00Z') + (39 - i) * 1.5 * 60_000).toISOString(),
      action: 'save',
      restoredFrom: null,
      restoredBefore: null,
    }));
    const list = vi.fn().mockImplementation(async (before?: string) => {
      const start = before === undefined ? 0 : many.findIndex((row) => row.revision === before) + 1;
      return many.slice(start, start + 20);
    });
    setup({ list });
    fireEvent.click(await screen.findByRole('button', { name: '版 34〜40 の内訳を開く' }));
    expect(screen.getByRole('button', { name: '版 34〜40 の内訳を閉じる' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: '前の版を読み込む' }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await screen.findByRole('button', { name: '版 1〜5 の内訳を開く' });
    // 区切りがずれず、開いていた内訳も開いたまま残る。
    expect(screen.getByRole('button', { name: '版 34〜40 の内訳を閉じる' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('button', { name: '版 34〜40 の内訳を開く' })).not.toBeInTheDocument();
  });

  it('一覧の下端で開いたまとまりは、前の版を読み込んで下端が伸びても閉じない', async () => {
    // 1ページ目(20件)の最後のまとまりは、読み込みで最古の版が変わる。開閉キーが最古の版だとここで閉じる。
    const many = Array.from({ length: 40 }, (_, i) => ({
      revision: String(40 - i),
      title: '合成',
      recordedAt: new Date(Date.parse('2026-10-06T00:00:00Z') + (39 - i) * 1.5 * 60_000).toISOString(),
      action: 'save',
      restoredFrom: null,
      restoredBefore: null,
    }));
    const list = vi.fn().mockImplementation(async (before?: string) => {
      const start = before === undefined ? 0 : many.findIndex((row) => row.revision === before) + 1;
      return many.slice(start, start + 20);
    });
    setup({ list });
    // 1ページ目は版 40〜21。いちばん下のまとまりは版 21〜26。
    fireEvent.click(await screen.findByRole('button', { name: '版 21〜26 の内訳を開く' }));
    fireEvent.click(screen.getByRole('button', { name: '前の版を読み込む' }));
    // 読み込むと、そのまとまりは版 20〜26 に伸びる。開いたまま残る。
    expect(await screen.findByRole('button', { name: '版 20〜26 の内訳を閉じる' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('内訳の版を選んで閉じても、まとまりの行が選択中として示される', async () => {
    setupGrouped();
    const toggle = await screen.findByRole('button', { name: '版 2〜4 の内訳を開く' });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: /^版 3/ }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '比較先' })).toHaveValue('3'));
    fireEvent.click(screen.getByRole('button', { name: '版 2〜4 の内訳を閉じる' }));
    const header = screen.getByText(/保存 3回/).closest('button');
    expect(header).toHaveAttribute('aria-current', 'true');
  });

  it('時刻が版番号の順と逆でも、時刻の範囲は早い方から遅い方へ出す', async () => {
    // 最古の版(2)の時刻が最も遅く、版 3 が最も早い。位置（最古・最新の版）で範囲を作ると始まりと終わりが逆になる。
    // 表示は時刻帯に依存するので、<time> の dateTime で順序を確かめる。
    const skewed = rows.map((row) => {
      if (row.revision === '2') return { ...row, recordedAt: '2026-10-06T00:01:30Z' };
      if (row.revision === '3') return { ...row, recordedAt: '2026-10-06T00:00:00Z' };
      if (row.revision === '4') return { ...row, recordedAt: '2026-10-06T00:00:40Z' };
      return row;
    });
    setup({ list: vi.fn().mockResolvedValue(skewed) });
    const header = (await screen.findByText(/保存 3回/)).closest('button');
    const [first, last] = Array.from(header?.querySelectorAll('time') ?? []).map((time) =>
      time.getAttribute('datetime'),
    );
    expect(first).toBe('2026-10-06T00:00:00Z');
    expect(last).toBe('2026-10-06T00:01:30Z');
    // 見えている文字も、早い方から遅い方へ（期待値は実行環境の時刻帯で同じ書式から作る）。
    const startText = new Date('2026-10-06T00:00:00Z').toLocaleString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const endText = new Date('2026-10-06T00:01:30Z').toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const times = Array.from(header?.querySelectorAll('time') ?? []).map((time) => time.textContent);
    expect(times).toEqual([startText, endText]);
  });

  it('内訳を開いている間は、選んだ版だけが選択中（aria-current）で、閉じるとまとまりの行に移る', async () => {
    setupGrouped();
    const toggle = await screen.findByRole('button', { name: '版 2〜4 の内訳を開く' });
    const header = screen.getByText(/保存 3回/).closest('button');
    // 閉じている間は、まとまりの内訳の一覧が存在しないので aria-controls を付けない。
    expect(toggle).not.toHaveAttribute('aria-controls');
    fireEvent.click(toggle);
    const open = screen.getByRole('button', { name: '版 2〜4 の内訳を閉じる' });
    const controlled = open.getAttribute('aria-controls');
    expect(controlled).toBeTruthy();
    expect(document.getElementById(controlled as string)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^版 3/ }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '比較先' })).toHaveValue('3'));
    // 開いている間：選んだ版の行だけが aria-current。まとまりの行は付けず、見た目の強調も出さない。
    expect(header).not.toHaveAttribute('aria-current');
    expect(header?.className).not.toContain('border-primary');
    expect(screen.getByRole('button', { name: /^版 3/ })).toHaveAttribute('aria-current', 'true');
    fireEvent.click(screen.getByRole('button', { name: '版 2〜4 の内訳を閉じる' }));
    expect(screen.getByText(/保存 3回/).closest('button')).toHaveAttribute('aria-current', 'true');
  });

  it('時刻の範囲は分が変わったときだけ「〜」で終わりを出す', async () => {
    // 「版 2〜4」にも〜があるので、時刻の行（ボタン内の最初の span）だけを見る。
    const timeLine = async () => (await screen.findByText(/保存 3回/)).closest('button')?.querySelector('span') ?? null;
    setupGrouped();
    expect(await timeLine()).toHaveTextContent(/〜.*の編集/);
    cleanup();
    // 同じ分のうちに収まる3回の保存。
    const sameMinute = rows.map((row, i) => (i < 3 ? { ...row, recordedAt: `2026-10-06T00:00:0${3 - i}Z` } : row));
    setup({ list: vi.fn().mockResolvedValue(sameMinute) });
    const line = await timeLine();
    expect(line).toHaveTextContent(/の編集/);
    expect(line).not.toHaveTextContent('〜');
  });

  it('まとまりの行を押すと、その中で最新の版を比較先にする', async () => {
    setupGrouped();
    await screen.findByRole('button', { name: '版 2〜4 の内訳を開く' });
    fireEvent.click(screen.getByText(/保存 3回/));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '比較先' })).toHaveValue('4'));
  });

  it('開くと中の版を選べ、そこから戻せる', async () => {
    const { api } = setupGrouped();
    fireEvent.click(await screen.findByRole('button', { name: '版 2〜4 の内訳を開く' }));
    expect(screen.getByRole('button', { name: '版 2〜4 の内訳を閉じる' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: /^版 3/ }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '比較先' })).toHaveValue('3'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'この版に戻す' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'この版に戻す' }));
    await screen.findByRole('alertdialog');
    expect(api.previewRestore).toHaveBeenCalledWith('3', '2');
  });

  it('比較の選択肢には、たたんだ版も含めてすべての版を出す', async () => {
    setupGrouped();
    await screen.findByRole('button', { name: '版 2〜4 の内訳を開く' });
    const options = within(screen.getByRole('combobox', { name: '比較先' })).getAllByRole('option');
    expect(options.map((option) => option.getAttribute('value'))).toEqual(['4', '3', '2', '1']);
  });
});

// #577: 将来の保持処理で版が無くなった場合、サーバーは NOT_FOUND を返す。画面が成功や「戻せる」と誤って見せないこと。
describe('履歴に無い版（NOT_FOUND）', () => {
  it('差分の読込が NOT_FOUND なら差分を出さずに読み込み失敗を示す', async () => {
    setup({
      read: vi.fn().mockImplementation(async (revision) => {
        if (revision === '1') throw new Error('NOT_FOUND');
        return snapshot(revision);
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: /版 1/ }));
    expect(await screen.findByText('差分を読み込めませんでした。')).toBeInTheDocument();
    expect(screen.queryByText(/差分 1項目/)).not.toBeInTheDocument();
  });

  it('復元の確認が NOT_FOUND なら確認画面を開かず、内容は変えていないと示す', async () => {
    const { api, onRestored } = setup({ previewRestore: vi.fn().mockRejectedValue(new Error('NOT_FOUND')) });
    await selectOld();
    fireEvent.click(screen.getByRole('button', { name: 'この版に戻す' }));
    expect(
      await screen.findByText('復元の確認を取得できませんでした。内容は変更していません。もう一度お試しください。'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(api.restore).not.toHaveBeenCalled();
    expect(onRestored).not.toHaveBeenCalled();
  });

  it('復元の実行が NOT_FOUND なら成功の通知を出さず、親へ復元済みと伝えない', async () => {
    const { onRestored } = setup({ restore: vi.fn().mockRejectedValue(new Error('NOT_FOUND')) });
    const dialog = await confirmOld();
    fireEvent.click(within(dialog).getByRole('button', { name: '戻す' }));
    expect(
      await within(dialog).findByText('復元の完了を確認できませんでした。再試行するか、やめるを選んでください。'),
    ).toBeVisible();
    expect(screen.queryByText('選択した版の状態に戻しました。')).not.toBeInTheDocument();
    expect(onRestored).not.toHaveBeenCalled();
  });
});
