import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentSnapshot } from '@/db/document-service';
import { VersionHistory, type VersionHistoryApi } from './version-history';

vi.mock('@/component/skill-sheet-viewer', () => ({ default: () => <p>全シート描画</p> }));
const snapshot = (revision: string, editable = true): DocumentSnapshot => ({
  sheetId: 'sheet',
  title: '合成文書',
  revision,
  blocks: [{ id: 'block', type: 'markdown', order: 0, data: { markdown: `本文${revision}\n\n` } }],
  validation: { editable, issues: editable ? [] : [{ blockId: 'block', path: 'data.future', code: 'UNKNOWN_FIELD' }] },
});
function setup(
  overrides: Partial<VersionHistoryApi> = {},
  editable = true,
  restoreBlockedReason?: string,
  currentRevision = '2',
) {
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
      currentRevision={currentRevision}
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
// 板どおり、比較元・比較先は一覧の行の「比較元」「比較先」で選ぶ。名前は「比較元（版 N）」。
const pickName = (side: '比較元' | '比較先', revision: string) => `${side}（版 ${revision}）`;
async function findPick(side: '比較元' | '比較先', revision: string) {
  return await screen.findByRole('button', { name: pickName(side, revision) });
}
// 旧版（版 1）を比較先、現在の版（版 2）を比較元にする。
async function selectOld() {
  fireEvent.click(await findPick('比較先', '1'));
  fireEvent.click(await findPick('比較元', '2'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'この版に戻す' })).toBeEnabled());
}
async function confirmOld() {
  await selectOld();
  fireEvent.click(screen.getByRole('button', { name: 'この版に戻す' }));
  return await screen.findByRole('alertdialog');
}
describe('シート全体の版の履歴', () => {
  describe('板どおりの配置（#674）', () => {
    it('1280 の列幅は一覧 360px・比較 440px', async () => {
      setup();
      const aside = await screen.findByRole('complementary', { name: '保存された版' });
      expect(aside.parentElement).toHaveClass('md:grid-cols-[minmax(0,360px)_minmax(0,440px)]');
    });
    it('390 の一覧画面の下には主ボタン「変更を見る（時刻 → 現在）」があって、押すと比較画面に切り替わる', async () => {
      setup();
      const aside = await screen.findByRole('complementary', { name: '保存された版' });
      // 比較先は既定で現在の版なので、板どおり「（時刻 → 現在）」の名札になる。
      const cta = within(aside).getByRole('button', { name: /変更を見る（.+ → 現在）/ });
      expect(cta).toBeEnabled();
      fireEvent.click(cta);
      // jsdom では画面の出し分けは class で確かめる（390 では一覧が隠れて比較だけの画面になる）。
      await waitFor(() => expect(aside).toHaveClass('hidden'));
      // hidden 側にフォーカスを残さないよう、遷移先の操作へ移す（板: 別画面の切替）。
      const back = screen.getByRole('button', { name: '一覧へ' });
      await waitFor(() => expect(back).toHaveFocus());
      // 比較画面の帯には一覧へ戻るボタンが出る。
      fireEvent.click(back);
      await waitFor(() => expect(aside).not.toHaveClass('hidden'));
      await waitFor(() => expect(cta).toHaveFocus());
    });
    it('比べられる版が無い時は「変更を見る」を押せない', async () => {
      setup({ list: vi.fn().mockResolvedValue([]) });
      const aside = await screen.findByRole('complementary', { name: '保存された版' });
      expect(within(aside).getByRole('button', { name: /変更を見る/ })).toBeDisabled();
    });
    it('戻す前の確認は板のダイアログの寸法（最大 480px・ボタン 36px・390 では主ボタンが上）', async () => {
      setup();
      const dialog = await confirmOld();
      expect(dialog).toHaveClass('max-w-[480px]');
      const restore = within(dialog).getByRole('button', { name: '戻す' });
      expect(restore).toHaveClass('h-9');
      expect(restore).toHaveClass('max-sm:order-first');
    });
  });
  describe('比較ペインの状態（一覧の取得状態から決まる）', () => {
    it('一覧の取得に失敗したら読み込み中を出さず、読み直しを促す', async () => {
      setup({ list: vi.fn().mockRejectedValue(new Error('失敗')) });
      await screen.findByText('履歴を読み込めませんでした。');
      expect(screen.getByText('一覧を読み直してください')).toBeInTheDocument();
      expect(screen.queryByText('差分を読み込み中…')).not.toBeInTheDocument();
      // 一覧の失敗は role=alert を1つだけ出す（比較欄は role を付けない）。
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      expect(screen.getByRole('alert')).toHaveTextContent('履歴を読み込めませんでした。');
      expect(screen.getByRole('alert')).toHaveClass('rounded-lg', 'p-5', 'space-y-3');
    });

    it('失敗 → 再試行 → 回復すると、失敗の文と alert が消えて版が並ぶ', async () => {
      const rows = [
        {
          revision: '2',
          title: '合成',
          recordedAt: '2026-10-06T00:10:00Z',
          action: 'save',
          restoredFrom: null,
          restoredBefore: null,
        },
        {
          revision: '1',
          title: '合成',
          recordedAt: '2026-10-06T00:00:00Z',
          action: 'save',
          restoredFrom: null,
          restoredBefore: null,
        },
      ];
      const list = vi.fn().mockRejectedValueOnce(new Error('失敗')).mockResolvedValue(rows);
      setup({ list });
      fireEvent.click(await screen.findByRole('button', { name: '再試行' }));
      await findPick('比較先', '1');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByText('一覧を読み直してください')).not.toBeInTheDocument();
    });

    it('版が残っているまま追加読み込みが失敗し別の版を選んでも、取得中は alert でなく読み込み中を出す', async () => {
      // 20件そろえると「前の版を読み込む」が出る。2分以上あけて自動保存のまとまりにたたまれない。
      const page = Array.from({ length: 20 }, (_, i) => ({
        revision: String(40 - i),
        title: '合成',
        recordedAt: new Date(Date.UTC(2026, 9, 6, 12, 0) - i * 600_000).toISOString(),
        action: 'save',
        restoredFrom: null,
        restoredBefore: null,
      }));
      const list = vi.fn().mockResolvedValueOnce(page).mockRejectedValue(new Error('失敗'));
      let finish!: (v: DocumentSnapshot) => void;
      setup({
        list,
        read: vi.fn().mockImplementation(async (rev) =>
          rev === '21'
            ? new Promise<DocumentSnapshot>((resolve) => {
                finish = resolve;
              })
            : snapshot(rev),
        ),
      });
      fireEvent.click(await screen.findByRole('button', { name: /前の版を読み込む/ }));
      await screen.findByText('履歴を読み込めませんでした。');
      fireEvent.click(screen.getByRole('button', { name: pickName('比較先', '21') }));
      expect(await screen.findByRole('status', { name: '' })).toHaveTextContent('差分を読み込み中…');
      expect(screen.queryByText('一覧を読み直してください')).not.toBeInTheDocument();
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      await act(async () => finish(snapshot('21')));
    });

    it('保存された版が0件なら読み込み中を出さず、比べる版がないと伝える', async () => {
      setup({ list: vi.fn().mockResolvedValue([]) });
      await screen.findByText('保存された版がありません。');
      expect(screen.getByText('編集して保存すると、ここに版が残ります。').parentElement).toHaveClass(
        'rounded-lg',
        'border',
        'bg-card',
        'p-5',
        'space-y-3',
      );
      expect(screen.getByText('まだ比べる版がありません')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByText('差分を読み込み中…')).not.toBeInTheDocument();
    });

    it('一覧を取得している間だけ差分を読み込み中と出す', async () => {
      setup({ list: vi.fn().mockReturnValue(new Promise(() => {})) });
      expect(await screen.findByText('差分を読み込み中…')).toBeInTheDocument();
      expect(screen.queryByText('一覧を読み直してください')).not.toBeInTheDocument();
      expect(screen.queryByText('まだ比べる版がありません')).not.toBeInTheDocument();
    });

    it('版が1つなら一覧側の箱に理由と版の行を入れ、比較のボタンも選択の地も出さない。比較欄は「まだ比べる版がありません」', async () => {
      setup(
        {
          list: vi.fn().mockResolvedValue([
            {
              revision: '1',
              title: '合成',
              recordedAt: '2026-10-06T00:00:00Z',
              action: 'create',
              restoredFrom: null,
              restoredBefore: null,
            },
          ]),
        },
        true,
        undefined,
        '1',
      );
      // 板「版が1つしかありません。保存すると変更を比べられます。」: 理由は1文で、同じ箱（card・1px 枠・角丸・余白・間隔）に版の行も入る。
      const aside = screen.getByRole('complementary', { name: '保存された版' });
      const reason = await within(aside).findByText('版が1つしかありません。保存すると変更を比べられます。');
      const box = reason.parentElement as HTMLElement;
      expect(box).toHaveClass('rounded-lg', 'border', 'bg-card', 'p-5', 'space-y-3');
      expect(within(box).getByText('現在')).toBeInTheDocument();
      expect(within(box).getByText('作成 · 版 1')).toBeInTheDocument();
      // 比べる相手が無いので、比較元・比較先のボタンも、選択の地（bg-accent）も出さない。
      expect(within(aside).queryByRole('button', { name: /^比較(元|先)/ })).not.toBeInTheDocument();
      expect(box.querySelector('li > div')).not.toHaveClass('bg-accent');
      expect(within(box).getByText('現在')).not.toHaveClass('border');
      // 同じ文を2か所に出さない: 比較欄は「まだ比べる版がありません」だけ。
      expect(screen.getByText('まだ比べる版がありません')).toBeInTheDocument();
      const compare = screen.getByText('まだ比べる版がありません').parentElement as HTMLElement;
      expect(within(compare).queryByText(/版が1つしかありません/)).not.toBeInTheDocument();
      expect(screen.queryByText('いまの内容から変わる項目')).not.toBeInTheDocument();
    });

    it('版が2つなら一覧側の箱も「まだ比べる版がありません」も出さず、差分を出す', async () => {
      setup();
      const aside = screen.getByRole('complementary', { name: '保存された版' });
      await within(aside).findByRole('button', { name: pickName('比較先', '1') });
      expect(within(aside).queryByText(/版が1つしかありません/)).not.toBeInTheDocument();
      expect(screen.queryByText('まだ比べる版がありません')).not.toBeInTheDocument();
      expect(await screen.findByRole('heading', { name: 'いまの内容から変わる項目' })).toBeInTheDocument();
    });
  });

  it('行の「比較元」「比較先」で任意の2版を選び、選んだボタンを押下状態で示す', async () => {
    setup();
    // 既定は 比較先 = 最新（版 2）・比較元 = 2番目（版 1）。
    expect(await findPick('比較先', '2')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: pickName('比較元', '1') })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: pickName('比較元', '2') })).toHaveAttribute('aria-pressed', 'false');
    await selectOld();
    expect(screen.getByRole('button', { name: pickName('比較元', '2') })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: pickName('比較先', '1') })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: pickName('比較元', '1') })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: pickName('比較先', '2') })).toHaveAttribute('aria-pressed', 'false');
    // 板の色: 比較元は del 系、比較先は add 系、選んでいないものは枠だけ。
    expect(screen.getByRole('button', { name: pickName('比較元', '2') })).toHaveClass(
      'h-7',
      'border-danger',
      'bg-danger-soft',
    );
    expect(screen.getByRole('button', { name: pickName('比較先', '1') })).toHaveClass(
      'border-accent-text',
      'bg-accent-soft',
    );
    expect(screen.getByRole('button', { name: pickName('比較先', '2') })).toHaveClass(
      'border-border',
      'bg-transparent',
    );
    // 板の .ver.sel: 比較元に選んだ行の地を acc にする。
    expect(screen.getByRole('button', { name: pickName('比較元', '2') }).closest('.border-b')).toHaveClass('bg-accent');
    expect(screen.getByRole('button', { name: pickName('比較元', '1') }).closest('.border-b')).not.toHaveClass(
      'bg-accent',
    );
    expect(screen.getByRole('heading', { name: 'いまの内容から変わる項目' })).toBeInTheDocument();
    expect(screen.getByText('省略せず、変わった項目は全部並べます。')).toBeInTheDocument();
    // 同じ版を2つ選ぶと、差分ではなく選び直しを促し、戻すも押せない。
    fireEvent.click(screen.getByRole('button', { name: pickName('比較元', '1') }));
    await screen.findByText('同じ版を選んでいます。比べる版をもう1つ選んでください。');
    expect(screen.getByRole('button', { name: pickName('比較元', '1') })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'この版に戻す' })).toBeDisabled();
  });

  it('比較の選択欄（select）は置かず、行のボタンだけで選ぶ', async () => {
    setup();
    await findPick('比較先', '1');
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(document.querySelector('select')).toBeNull();
  });

  it('行の見出しは板の「10月6日 09:10」の書式で、現在の版に「現在」、復元の版に「復元」のタグを付ける', async () => {
    setup({
      list: vi.fn().mockResolvedValue([
        {
          revision: '2',
          title: '合成',
          recordedAt: '2026-10-06T00:10:00Z',
          action: 'restore',
          restoredFrom: '1',
          restoredBefore: null,
        },
        {
          revision: '1',
          title: '合成',
          recordedAt: '2026-10-06T00:00:00Z',
          action: 'create',
          restoredFrom: null,
          restoredBefore: null,
        },
      ]),
    });
    const row = (revision: string) =>
      screen.getByRole('button', { name: pickName('比較先', revision) }).closest('.border-b') as HTMLElement;
    await findPick('比較先', '1');
    // 期待値は実行環境の時刻帯で同じ書式から作る（「10月6日 09:10」の形）。
    const stamp = (iso: string) =>
      new Date(iso).toLocaleString('ja-JP', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    expect(within(row('2')).getByText(stamp('2026-10-06T00:10:00Z'))).toBeInTheDocument();
    expect(stamp('2026-10-06T00:10:00Z')).toMatch(/^\d+月\d+日 \d{2}:\d{2}$/);
    expect(within(row('2')).getByText('現在')).toHaveClass('h-5', 'bg-accent', 'text-accent-foreground');
    expect(within(row('2')).getByText('復元')).toHaveClass('h-5', 'bg-warn-soft', 'text-warn-strong');
    // 復元の行の説明は、戻した先（版 1）の日時で「10月6日 09:00 の版に戻した」。版番号も添える。
    expect(within(row('2')).getByText(`${stamp('2026-10-06T00:00:00Z')} の版に戻した · 版 2`)).toBeInTheDocument();
    expect(within(row('1')).queryByText('現在')).not.toBeInTheDocument();
    expect(within(row('1')).queryByText('復元')).not.toBeInTheDocument();
    expect(within(row('1')).getByText('作成 · 版 1')).toBeInTheDocument();
  });

  it('390 の帯: 一覧では「×」（編集画面へ）、比較では「‹」（一覧へ）の記号ボタンにし、sm 以上は文字を出す', async () => {
    setup();
    const close = screen.getByRole('button', { name: '編集画面へ' });
    expect(close).toHaveAttribute('aria-label', '編集画面へ');
    expect(close.querySelector('svg')).toHaveClass('sm:hidden');
    expect(within(close).getByText('編集画面へ')).toHaveClass('max-sm:hidden');
    // 板（390）の記号ボタンは 32px・記号 18px。当たり判定は ::before を外へ広げて 44px にする。
    expect(close).toHaveClass('max-sm:border-0', 'max-sm:h-8', 'max-sm:w-8', 'before:-inset-1.5');
    expect(close.querySelector('svg')).toHaveClass('h-[18px]', 'w-[18px]');
    const back = screen.getByRole('button', { name: '一覧へ' });
    expect(back).toHaveAttribute('aria-label', '一覧へ');
    expect(back.querySelector('svg')).toHaveClass('sm:hidden');
    expect(within(back).getByText('一覧へ')).toHaveClass('max-sm:hidden');
    // 一覧画面では「一覧へ」を出さず、比較画面では「編集画面へ」を 390 で隠す。
    expect(back).toHaveClass('hidden');
    expect(back.querySelector('svg')).toHaveClass('h-[18px]', 'w-[18px]');
    // 隠す側に display の指定を重ねない（重なると 390 で × と ‹ が両方出る）。
    expect(back).not.toHaveClass('inline-flex');
    expect(close).toHaveClass('max-sm:inline-flex');
    fireEvent.click(await screen.findByRole('button', { name: /変更を見る/ }));
    await waitFor(() => expect(back).toHaveClass('md:hidden'));
    expect(back).not.toHaveClass('hidden');
    expect(close).toHaveClass('max-sm:hidden');
    expect(close).not.toHaveClass('max-sm:inline-flex');
    // 板（390）の比較画面の帯は、「版の履歴」とシート名の代わりに比較の題を ‹ の隣に出す。
    const header = close.closest('header') as HTMLElement;
    const barTitle = within(header).getByText('いまの内容から変わる項目');
    expect(barTitle).toHaveClass('sm:hidden', 'text-base', 'font-semibold');
    expect(within(header).getByRole('heading', { name: '版の履歴', hidden: true })).toHaveClass('max-sm:hidden');
    expect(within(header).getByText('合成')).toHaveClass('max-sm:hidden');
    // 重複しないよう、ペイン側の見出しは 390 では隠す。
    expect(screen.getByRole('heading', { name: 'いまの内容から変わる項目' })).toHaveClass('max-sm:hidden');
    // 一覧へ戻ると、帯の題は「版の履歴」に戻る。
    fireEvent.click(back);
    await waitFor(() => expect(within(header).queryByText('いまの内容から変わる項目')).not.toBeInTheDocument());
    expect(within(header).getByRole('heading', { name: '版の履歴' })).not.toHaveClass('max-sm:hidden');
  });

  it('差分は場所を語で示し、前を「−」・後を「＋」で、引用符なし・改行ありで出す', async () => {
    const withText = (revision: string, text: string): DocumentSnapshot => ({
      ...snapshot(revision),
      blocks: [{ id: 'b', type: 'markdown', order: 0, data: { markdown: text } }],
    });
    setup({
      read: vi
        .fn()
        .mockImplementation(async (revision) => withText(revision, revision === '1' ? '前の行\n二行目' : '後の行')),
    });
    await selectOld();
    const frame = screen.getByRole('heading', { name: /本文$/ }).closest('section') as HTMLElement;
    expect(within(frame).getByRole('heading')).toHaveTextContent('テキスト › 前の行 › 本文');
    // 比較元は版2（現在）、比較先は版1。前の値は引用符なしで、改行を保ったまま出る。
    const del = frame.querySelector('del') as HTMLElement;
    const ins = frame.querySelector('ins') as HTMLElement;
    expect(del.textContent).toBe('後の行');
    expect(ins.textContent).toBe('前の行\n二行目');
    expect(del).toHaveClass('whitespace-pre-wrap');
    expect(frame.textContent).not.toContain('"');
    expect(frame.textContent).toContain('−');
    expect(frame.textContent).toContain('＋');
    expect(screen.getByRole('button', { name: '全項目の原文を確認' })).toBeEnabled();
  });

  it('ブロック描画でも選択した版のシートタイトルを明示する', async () => {
    setup({
      read: vi
        .fn()
        .mockImplementation(async (revision) => ({ ...snapshot(revision), title: `版${revision}のタイトル` })),
    });
    fireEvent.click(await findPick('比較先', '1'));
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
    expect(screen.getByRole('button', { name: pickName('比較元', '2') })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: pickName('比較先', '1') })).toHaveAttribute('aria-pressed', 'true');
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
    fireEvent.click(await findPick('比較先', '1'));
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
    fireEvent.click(await findPick('比較先', '1'));
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
    fireEvent.click(await screen.findByRole('button', { name: '再試行' }));
    await screen.findByText(/版が1つしかありません/);
    // 版が1つなら比べる相手が無いので、比較元・比較先のボタンを出さず、戻すも押せない。
    expect(screen.queryByRole('button', { name: pickName('比較元', '2') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: pickName('比較先', '2') })).not.toBeInTheDocument();
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
    await selectOld();
    await act(async () => finish(snapshot('2')));
    // 最初の（版 1 → 版 2 の）読み込みが遅れて届いても、いまの選択（版 2 → 版 1）の差分のまま。
    expect(screen.getByRole('button', { name: pickName('比較先', '1') })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/本文1/, { selector: 'ins' })).toBeInTheDocument();
    expect(screen.getByText(/本文2/, { selector: 'del' })).toBeInTheDocument();
  });
});

describe('戻す版・比較の選び方・行の表示（#626）', () => {
  const row = (revision: string, minute: string, extra: Record<string, unknown> = {}) => ({
    revision,
    title: '合成',
    recordedAt: `2026-10-06T00:${minute}:00Z`,
    action: 'save',
    restoredFrom: null,
    restoredBefore: null,
    ...extra,
  });
  // 版 3（現在）・2・1。10分おきなので自動保存のまとまりにはならない。
  const three = () => [row('3', '20'), row('2', '10'), row('1', '00')];
  const setupThree = (overrides: Partial<VersionHistoryApi> = {}) =>
    setup({ list: vi.fn().mockResolvedValue(three()), ...overrides }, true, undefined, '3');
  const stamp = (iso: string) =>
    new Date(iso).toLocaleString('ja-JP', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  it('旧版の「比較先」だけを押すと、比較元は現在になり、現在との差分が出て、その版を戻せる', async () => {
    const { api } = setup();
    // 既定は 比較元 = 版 1（2番目）・比較先 = 版 2（現在）。まず比較先を現在のまま、版 1 の比較先だけを押す。
    fireEvent.click(await findPick('比較先', '1'));
    // 比較元は押していないのに、現在（版 2）に合う。「内容は同じです。」にはならない。
    await waitFor(() =>
      expect(screen.getByRole('button', { name: pickName('比較元', '2') })).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(screen.getByRole('button', { name: pickName('比較元', '1') })).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(screen.getByRole('button', { name: 'この版に戻す' })).toBeEnabled());
    const frame = screen.getByRole('heading', { name: /本文$/ }).closest('section') as HTMLElement;
    // 前（削除）は現在の本文、後（追加）は選んだ旧版の本文。
    expect((frame.querySelector('del') as HTMLElement).textContent).toBe('本文2\n\n');
    expect((frame.querySelector('ins') as HTMLElement).textContent).toBe('本文1\n\n');
    expect(screen.queryByText('内容は同じです。')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'いまの内容から変わる項目' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'この版に戻す' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(api.previewRestore).toHaveBeenCalledWith('1', '2');
    // 確認の題は、戻す版（版 1）を指す。
    expect(within(dialog).getByText('版 1 の状態に戻します。')).toBeVisible();
  });

  it('既定（比較元 = 古い版・比較先 = 現在）でも、古い版を戻せる', async () => {
    const { api } = setup();
    await findPick('比較先', '2');
    await waitFor(() => expect(screen.getByRole('button', { name: 'この版に戻す' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'この版に戻す' }));
    await screen.findByRole('alertdialog');
    expect(api.previewRestore).toHaveBeenCalledWith('1', '2');
  });

  it('比較元に古い版・比較先に現在を自分で選んでも、古い版を戻せる（板の選び方）', async () => {
    const { api } = setupThree();
    // 比較先を旧版にして、比較元を旧版・比較先を現在に選び直す。
    fireEvent.click(await findPick('比較先', '2'));
    fireEvent.click(screen.getByRole('button', { name: pickName('比較元', '1') }));
    fireEvent.click(screen.getByRole('button', { name: pickName('比較先', '3') }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: pickName('比較先', '3') })).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(screen.getByRole('button', { name: pickName('比較元', '1') })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.getByRole('button', { name: 'この版に戻す' })).toBeEnabled());
    expect(screen.getByRole('heading', { name: 'いまの内容から変わる項目' })).toBeInTheDocument();
    // 差分の向きは変えない: 比較元（版 1）が削除、比較先（現在）が追加。
    const frame = screen.getByRole('heading', { name: /本文$/ }).closest('section') as HTMLElement;
    expect((frame.querySelector('del') as HTMLElement).textContent).toBe('本文1\n\n');
    expect((frame.querySelector('ins') as HTMLElement).textContent).toBe('本文3\n\n');
    fireEvent.click(screen.getByRole('button', { name: 'この版に戻す' }));
    await screen.findByRole('alertdialog');
    expect(api.previewRestore).toHaveBeenCalledWith('1', '3');
  });

  it('比較元を自分で選んだあとは、比較先を押しても比較元を現在に戻さない', async () => {
    const { api } = setupThree();
    fireEvent.click(await findPick('比較元', '1'));
    fireEvent.click(screen.getByRole('button', { name: pickName('比較先', '2') }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: pickName('比較先', '2') })).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(screen.getByRole('button', { name: pickName('比較元', '1') })).toHaveAttribute('aria-pressed', 'true');
    // 現在を含まない2版の比較: 見出しは「いまの内容から」と言わない。
    expect(await screen.findByRole('heading', { name: '比較元から比較先で変わる項目' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'いまの内容から変わる項目' })).not.toBeInTheDocument();
    // 戻すのは、現在でない側（比較先 = 版 2）。
    await waitFor(() => expect(screen.getByRole('button', { name: 'この版に戻す' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'この版に戻す' }));
    await screen.findByRole('alertdialog');
    expect(api.previewRestore).toHaveBeenCalledWith('2', '3');
  });

  it('現在の版そのものを比較先にしても、比較元は現在でなく既定の2番目に戻る（同じ版にしない）', async () => {
    setupThree();
    fireEvent.click(await findPick('比較先', '1'));
    expect(screen.getByRole('button', { name: pickName('比較元', '3') })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: pickName('比較先', '3') }));
    expect(screen.getByRole('button', { name: pickName('比較先', '3') })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: pickName('比較元', '2') })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('同じ版を選んでいます。比べる版をもう1つ選んでください。')).not.toBeInTheDocument();
  });

  it('同じ版を2つ選ぶと、差分でなく選び直しの案内を出し、戻す・原文の確認を押せない', async () => {
    const { api } = setup();
    fireEvent.click(await findPick('比較先', '1'));
    fireEvent.click(screen.getByRole('button', { name: pickName('比較元', '1') }));
    expect(await screen.findByText('同じ版を選んでいます。比べる版をもう1つ選んでください。')).toBeInTheDocument();
    expect(screen.queryByText('内容は同じです。')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /変わる項目/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'この版に戻す' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '全項目の原文を確認' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'この版に戻す' }));
    expect(api.previewRestore).not.toHaveBeenCalled();
  });

  it('現在どうしを選んだ時（戻す版が決まらない）も、戻すを押せない', async () => {
    setup();
    await findPick('比較先', '2');
    fireEvent.click(screen.getByRole('button', { name: pickName('比較元', '2') }));
    expect(await screen.findByText('同じ版を選んでいます。比べる版をもう1つ選んでください。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'この版に戻す' })).toBeDisabled();
  });

  it('現在と中身が同じ版は、戻す版に選んでも戻せない', async () => {
    setup({ read: vi.fn().mockImplementation(async (revision) => ({ ...snapshot('2'), revision })) });
    await findPick('比較先', '1');
    await screen.findByText('内容は同じです。');
    expect(screen.getByRole('button', { name: 'この版に戻す' })).toBeDisabled();
  });

  it('版番号を行・内訳・凡例に出し、同じ分の版を見分けられる', async () => {
    setup(
      {
        list: vi
          .fn()
          .mockResolvedValue([
            row('3', '20'),
            row('2', '10', { action: 'create' }),
            row('1', '00', { action: 'delete' }),
          ]),
      },
      true,
      undefined,
      '3',
    );
    await findPick('比較先', '1');
    expect(screen.getByText('保存 · 版 3')).toBeInTheDocument();
    expect(screen.getByText('作成 · 版 2')).toBeInTheDocument();
    expect(screen.getByText('削除前の状態 · 版 1')).toBeInTheDocument();
    // 凡例は「版 N 時刻」。既定は 比較元 = 版 2、比較先 = 版 3（現在）。
    expect(screen.getByText(/^比較元 · 削除 版 2 \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.getByText(/^比較先 · 追加 版 3 \d{2}:\d{2}（現在）$/)).toBeInTheDocument();
    // 帯の主ボタンは板どおり時刻だけ（版番号は付けない）。
    expect(screen.getByRole('button', { name: /^変更を見る（\d{2}:\d{2} → 現在）$/ })).toBeInTheDocument();
  });

  it('復元の行は、戻した先の版の日時を使い、一覧に無い版なら版番号で示す', async () => {
    setup(
      {
        list: vi
          .fn()
          .mockResolvedValue([
            row('5', '40', { action: 'restore', restoredFrom: '2', restoredBefore: '4' }),
            row('4', '30'),
            row('3', '20', { action: 'restore', restoredFrom: '1', restoredBefore: '2' }),
            row('2', '10'),
          ]),
      },
      true,
      undefined,
      '5',
    );
    await findPick('比較先', '2');
    expect(screen.getByText(`${stamp('2026-10-06T00:10:00Z')} の版に戻した · 版 5`)).toBeInTheDocument();
    // 戻した先（版 1）は一覧に無いので、日時ではなく版番号。
    expect(screen.getByText('版 1 に戻した · 版 3')).toBeInTheDocument();
    // 「復元」のタグと「復元前を確認」はそのまま。
    expect(screen.getAllByText('復元')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '版 5 の復元前（版 4）を確認' })).toBeInTheDocument();
  });

  it('比較元に選んだ行の中でも「現在」のタグが読める（枠と card の地）。選んでいない行では付けない', async () => {
    setupThree();
    // 比較先を旧版にすると比較元は現在（版 3）になり、現在の行が選択の地（acc）になる。
    fireEvent.click(await findPick('比較先', '1'));
    const current = screen.getByRole('button', { name: pickName('比較先', '3') }).closest('.border-b') as HTMLElement;
    expect(current).toHaveClass('bg-accent');
    expect(within(current).getByText('現在')).toHaveClass('border', 'border-accent-text', 'bg-card');
    // 選んだ行の「復元」タグにも枠を付け、選んでいない行では付けない。
    cleanup();
    setup(
      {
        list: vi.fn().mockResolvedValue([row('3', '20'), row('2', '10', { action: 'restore', restoredFrom: '1' })]),
      },
      true,
      undefined,
      '3',
    );
    // 既定の比較元（版 2）が復元の行。選択の地の中では「復元」のタグにも枠を付ける。
    const restoreRow = (await findPick('比較先', '2')).closest('.border-b') as HTMLElement;
    expect(restoreRow).toHaveClass('bg-accent');
    expect(within(restoreRow).getByText('復元')).toHaveClass('border', 'border-border');
    fireEvent.click(screen.getByRole('button', { name: pickName('比較元', '3') }));
    expect(restoreRow).not.toHaveClass('bg-accent');
    expect(within(restoreRow).getByText('復元')).not.toHaveClass('border');
  });

  it('一覧の一文は、1280 では「下に出します」・390 では「出します」', async () => {
    setup();
    await findPick('比較先', '1');
    const narrow = screen.getByText('2つ選ぶと、何が変わったかを出します');
    const wide = screen.getByText('2つ選ぶと、何が変わったかを下に出します');
    expect(narrow).toHaveClass('md:hidden');
    expect(wide).toHaveClass('max-md:hidden');
  });

  it('戻した直後の通知は、戻した版の日時を板の文で出し、取り消しの説明も添える', async () => {
    setup();
    const dialog = await confirmOld();
    fireEvent.click(within(dialog).getByRole('button', { name: '戻す' }));
    const notice = await screen.findByRole('status', { name: '' });
    expect(notice).toHaveTextContent(
      `${stamp('2026-10-06T00:00:00Z')} の版に戻しました。いまの内容も履歴に残っています。`,
    );
    expect(notice).toHaveTextContent('履歴には「復元」が2つ積まれます。');
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
  const groupPick = (side: '比較元' | '比較先') => `${side}（版 2〜4 の最新・版 4）`;
  // 一覧の最新（版 4）が現在の版。
  function setupGrouped() {
    return setup({ list: vi.fn().mockResolvedValue(rows) }, true, undefined, '4');
  }

  it('続けた保存を1行にたたみ、回数と版の範囲を出す。既定の比較元が内側の版なので、読み込み直後は開いている', async () => {
    setupGrouped();
    // 既定の比較元は2番目に新しい版 3（まとまりの内側）。選んだ行が見えるよう、まとまりは開いて始まる。
    const opened = await screen.findByRole('button', { name: '版 2〜4 の内訳を閉じる' });
    expect(opened).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: pickName('比較元', '3') })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(opened);
    const toggle = screen.getByRole('button', { name: '版 2〜4 の内訳を開く' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/保存 3回 · 版 2〜4/)).toBeInTheDocument();
    // たたんでいる間は中の版の行を出さない。作成の版は1行のまま出す。
    expect(screen.queryByRole('button', { name: pickName('比較先', '3') })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: pickName('比較先', '1') })).toBeInTheDocument();
    // 板: 開閉はタイトル横のタグ「N版 ▾」。
    expect(toggle).toHaveTextContent('3版 ▾');
    expect(toggle).toHaveClass('h-5', 'bg-chip-bg');
  });

  it('開閉タグ「N版 ▾」は見た目の高さ 20px のまま、当たり判定を ::before で上下 10px 外へ広げて 40px 以上にする', async () => {
    setupGrouped();
    const toggle = await screen.findByRole('button', { name: /版 2〜4 の内訳を/ });
    // 20px + 上下 10px ずつ = 40px。見た目の大きさ（h-5）は変えない。
    expect(toggle).toHaveClass('h-5', 'relative', 'before:absolute', 'before:-inset-y-2.5', 'before:-inset-x-2');
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
    // 既定の比較元（版 39）が最新のまとまりの内側なので、そのまとまりは開いて始まる。
    expect(await screen.findByRole('button', { name: '版 34〜40 の内訳を閉じる' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: '前の版を読み込む' }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await screen.findByRole('button', { name: '版 1〜5 の内訳を開く' });
    // 区切りがずれず、開いていた内訳も開いたまま残る。読み込みで勝手に閉じも開き直しもしない。
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

  it('内側の版を選んで閉じると、まとまりの行は選択中を示さない（行の操作は最新の版を選ぶため）。開き直すと中の行が示す', async () => {
    setupGrouped();
    const toggle = await screen.findByRole('button', { name: '版 2〜4 の内訳を閉じる' });
    fireEvent.click(await findPick('比較先', '3'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: pickName('比較先', '3') })).toHaveAttribute('aria-pressed', 'true'),
    );
    fireEvent.click(toggle);
    // 閉じたまとまりの行は、実際に選んでいる比較先の版 3 ではなく最新（版 4）を指す。比較先は押下状態にしない。
    // 比較元は現在の版 4（最新）なので、そちらは示してよい。
    const header = screen.getByRole('button', { name: groupPick('比較先') });
    expect(header).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: groupPick('比較元') })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '版 2〜4 の内訳を開く' }));
    expect(screen.getByRole('button', { name: pickName('比較先', '3') })).toHaveAttribute('aria-pressed', 'true');
  });

  it('閉じたまとまりの行は、選んでいる版がまとまりの最新の時だけ押下状態・選択の地になる', async () => {
    setupGrouped();
    // 版 1（作成）を比較先にすると、比較元は現在（版 4・まとまりの最新）に合わせる。
    fireEvent.click(await findPick('比較先', '1'));
    fireEvent.click(screen.getByRole('button', { name: '版 2〜4 の内訳を閉じる' }));
    const header = screen.getByRole('button', { name: groupPick('比較元') });
    expect(header).toHaveAttribute('aria-pressed', 'true');
    expect(header.closest('.border-b')).toHaveClass('bg-accent');
    expect(screen.getByRole('button', { name: groupPick('比較先') })).toHaveAttribute('aria-pressed', 'false');
  });

  it('選択が内側の版に変わったら、閉じていたまとまりを開いて選んだ行を見せる', async () => {
    setupGrouped();
    fireEvent.click(await findPick('比較先', '1'));
    // 版 4 が比較元（最新）なので、閉じられる。
    fireEvent.click(await screen.findByRole('button', { name: '版 2〜4 の内訳を閉じる' }));
    expect(screen.queryByRole('button', { name: pickName('比較元', '3') })).not.toBeInTheDocument();
    // 比較先を現在の版 4 に戻すと、比較元は既定（2番目の版 3）に戻る。内側の版なので開く。
    fireEvent.click(screen.getByRole('button', { name: groupPick('比較先') }));
    expect(await screen.findByRole('button', { name: '版 2〜4 の内訳を閉じる' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: pickName('比較元', '3') })).toHaveAttribute('aria-pressed', 'true');
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
    const header = (await screen.findByText(/保存 3回/)).parentElement;
    const [first, last] = Array.from(header?.querySelectorAll('time') ?? []).map((time) =>
      time.getAttribute('datetime'),
    );
    expect(first).toBe('2026-10-06T00:00:00Z');
    expect(last).toBe('2026-10-06T00:01:30Z');
    // 見えている文字も、早い方から遅い方へ（期待値は実行環境の時刻帯で同じ書式から作る）。
    const startText = new Date('2026-10-06T00:00:00Z').toLocaleString('ja-JP', {
      month: 'long',
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

  it('内訳を開いている間は、選んだ版の行のボタンだけが押下状態で、まとまりの行は示さない', async () => {
    setupGrouped();
    const toggle = await screen.findByRole('button', { name: '版 2〜4 の内訳を閉じる' });
    const header = screen.getByRole('button', { name: groupPick('比較先') });
    // 既定の比較元は版 3（内側）。まとまりの行の操作が指す版 4 ではないので、まとまりの行は示さず、中の行が示す。
    expect(screen.getByRole('button', { name: groupPick('比較元') })).toHaveAttribute('aria-pressed', 'false');
    expect(header.closest('.border-b')).not.toHaveClass('bg-accent');
    expect(screen.getByRole('button', { name: pickName('比較元', '3') })).toHaveAttribute('aria-pressed', 'true');
    // まとまりの内訳の一覧があるので aria-controls を付ける。
    const controlled = toggle.getAttribute('aria-controls');
    expect(controlled).toBeTruthy();
    expect(document.getElementById(controlled as string)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: pickName('比較先', '3') }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: pickName('比較先', '3') })).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(header).toHaveAttribute('aria-pressed', 'false');
    expect(header).not.toHaveClass('bg-accent-soft');
    expect(screen.getByRole('button', { name: pickName('比較先', '4') })).toHaveAttribute('aria-pressed', 'false');
    // 閉じると内訳の一覧が無くなるので aria-controls を外す。
    fireEvent.click(screen.getByRole('button', { name: '版 2〜4 の内訳を閉じる' }));
    expect(screen.getByRole('button', { name: '版 2〜4 の内訳を開く' })).not.toHaveAttribute('aria-controls');
  });

  it('時刻の範囲は分が変わったときだけ「〜」で終わりを出す', async () => {
    // 「版 2〜4」にも〜があるので、時刻の行（ボタン内の最初の span）だけを見る。
    const timeLine = async () => (await screen.findByText(/保存 3回/)).parentElement?.querySelector('span') ?? null;
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

  it('まとまりの行の「比較先」「比較元」は、その中で最新の版を選ぶ', async () => {
    setupGrouped();
    fireEvent.click(await findPick('比較先', '1'));
    fireEvent.click(screen.getByRole('button', { name: pickName('比較元', '1') }));
    // 同じ版（版 1）になるので、まとまりの行はどちらも押下状態ではない。
    expect(screen.getByRole('button', { name: groupPick('比較先') })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: groupPick('比較先') }));
    fireEvent.click(screen.getByRole('button', { name: groupPick('比較元') }));
    // 両方とも最新の版 4 なので、まとまりの行が示す（同じ版を選んでいる）。
    expect(screen.getByRole('button', { name: groupPick('比較先') })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: groupPick('比較元') })).toHaveAttribute('aria-pressed', 'true');
    // 開くと（既定の比較元が内側の版だったので、まとまりは開いたまま）、選ばれているのは最新の版 4 だと分かる。
    expect(screen.getByRole('button', { name: '版 2〜4 の内訳を閉じる' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: pickName('比較先', '4') })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: pickName('比較元', '4') })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: pickName('比較先', '3') })).toHaveAttribute('aria-pressed', 'false');
  });

  it('開くと中の版を選べ、そこから戻せる', async () => {
    const { api } = setupGrouped();
    expect(await screen.findByRole('button', { name: '版 2〜4 の内訳を閉じる' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: pickName('比較先', '3') }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: pickName('比較先', '3') })).toHaveAttribute('aria-pressed', 'true'),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'この版に戻す' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'この版に戻す' }));
    await screen.findByRole('alertdialog');
    expect(api.previewRestore).toHaveBeenCalledWith('3', '4');
  });

  it('たたんだ版も、開けばすべての版に「比較元」「比較先」がある', async () => {
    setupGrouped();
    await screen.findByRole('button', { name: '版 2〜4 の内訳を閉じる' });
    for (const revision of ['4', '3', '2', '1']) {
      expect(screen.getByRole('button', { name: pickName('比較元', revision) })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: pickName('比較先', revision) })).toBeInTheDocument();
    }
    // 内訳の行は板どおり時刻を等幅で出す。同じ分に収まる保存を見分けるため、秒と版番号も添える（「00:00:30 · 版 3」）。
    const child = screen.getByRole('button', { name: pickName('比較先', '3') }).parentElement?.parentElement;
    expect(child?.querySelector('p')).toHaveClass('font-mono');
    expect(child?.querySelector('p')).toHaveTextContent(/^\d{2}:\d{2}:\d{2} · 版 3$/);
    const secondsOf = (revision: string) =>
      screen
        .getByRole('button', { name: pickName('比較先', revision) })
        .parentElement?.parentElement?.querySelector('p')?.textContent;
    expect(new Set(['4', '3', '2'].map(secondsOf)).size).toBe(3);
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
    fireEvent.click(await findPick('比較先', '1'));
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
