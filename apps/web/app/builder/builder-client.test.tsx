import type { Block } from '@skillsheet/db/blocks';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TRPCClientError } from '@trpc/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BuilderClient, { assembleMarkdown, blockToItem, type EditorItem } from './builder-client';

// TRPCClientError.data.code を実クラスで組み立てる（instanceof チェックを本物にするため）。
function trpcClientError(code: string): TRPCClientError<never> {
  return new TRPCClientError(code, { result: { error: { data: { code } } } } as never);
}

const mockSave = vi.fn().mockResolvedValue({ updatedAt: new Date() });
const mockCreate = vi.fn().mockResolvedValue({ sheetId: 'new-id' });
const mockDelete = vi.fn().mockResolvedValue({ ok: true });
const mockInvalidate = vi.fn().mockResolvedValue(undefined);
// builder-client.tsx は trpc.sheet.*.useMutation().mutateAsync(...) と
// trpc.sheet.list.useQuery(undefined, { initialData }) / trpc.useUtils() を呼ぶため、
// フックが最小限の形を返すようモックする。useQuery は initialData をそのまま返せば十分
// （このテストでは一覧の再取得タイミングそのものは検証しない）。
vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    sheet: {
      save: { useMutation: () => ({ mutateAsync: mockSave }) },
      create: { useMutation: () => ({ mutateAsync: mockCreate }) },
      delete: { useMutation: () => ({ mutateAsync: mockDelete }) },
      list: { useQuery: (_input: unknown, opts: { initialData: unknown }) => ({ data: opts.initialData }) },
    },
    useUtils: () => ({ sheet: { list: { invalidate: mockInvalidate } } }),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
// テーマ Provider なしで BuilderClient 単体を描画できるようにモック（ダークトグルが useThemeMode を使う）
vi.mock('@/context/theme-context', () => ({ useThemeMode: () => ({ mode: 'light', toggleTheme: vi.fn() }) }));

// markdown ブロック配列から初期 Block[] を作るヘルパ。
const mdBlocks = (markdowns: string[]): Block[] =>
  markdowns.map((markdown, order) => ({ id: `block-${order}`, type: 'markdown', order, data: { markdown } }));

const defaultSheet = { id: 'sheet-1', title: 'テストシート', updatedAt: new Date() };
const defaultProps = { sheets: [defaultSheet], activeSheetId: 'sheet-1' };

describe('BuilderClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('初期 markdown ブロックがテキストエリアとして表示される', () => {
    render(<BuilderClient initialBlocks={mdBlocks(['## A', '## B'])} initialTitle="t" {...defaultProps} />);
    const areas = screen.getAllByPlaceholderText('Markdown を入力...') as HTMLTextAreaElement[];
    expect(areas).toHaveLength(2);
    expect(areas[0].value).toBe('## A');
    expect(areas[1].value).toBe('## B');
  });

  it('「テキスト」で空ブロックが増える', async () => {
    const user = userEvent.setup();
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="t" {...defaultProps} />);
    // パレットチップと下部ボタンの両方に「テキスト」ボタンがあるため末尾（下部ボタン）を使う
    const textBtns = screen.getAllByRole('button', { name: 'テキスト' });
    await user.click(textBtns[textBtns.length - 1]);
    expect(screen.getAllByPlaceholderText('Markdown を入力...')).toHaveLength(2);
  });

  it('削除ボタンでブロックが減る', async () => {
    const user = userEvent.setup();
    render(<BuilderClient initialBlocks={mdBlocks(['## A', '## B'])} initialTitle="t" {...defaultProps} />);
    await user.click(screen.getAllByLabelText('ブロックを削除')[0]);
    const areas = screen.getAllByPlaceholderText('Markdown を入力...') as HTMLTextAreaElement[];
    expect(areas).toHaveLength(1);
    expect(areas[0].value).toBe('## B');
  });

  it('保存ボタンで {title, blocks, sheetId} が保存 mutation に渡る', async () => {
    const user = userEvent.setup();
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="マイシート" {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /保存/ }));
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'マイシート',
        blocks: [{ type: 'markdown', data: { markdown: '## A' } }],
        sheetId: 'sheet-1',
      }),
    );
  });

  // headless E2E で再現した実バグの回帰テスト: unstable_cache のキャッシュ命中時は内部で
  // JSON.stringify/JSON.parse を通すため、RSC が渡す sheets[].updatedAt が Date ではなく
  // ISO 文字列になることがある（既存シートを開いて保存するたびに再現）。expectedUpdatedAt は
  // z.date() を要求するため、文字列のまま送ると保存 mutation が BAD_REQUEST で毎回失敗していた。
  it('initialSheets の updatedAt が文字列（unstable_cache 由来）でも Date として保存 mutation に渡る', async () => {
    const user = userEvent.setup();
    const sheetsWithStringUpdatedAt = [
      { id: 'sheet-1', title: 'テストシート', updatedAt: '2026-08-05T12:00:00.000Z' as unknown as Date },
    ];
    render(
      <BuilderClient
        initialBlocks={mdBlocks(['## A'])}
        initialTitle="マイシート"
        sheets={sheetsWithStringUpdatedAt}
        activeSheetId="sheet-1"
      />,
    );
    await user.click(screen.getByRole('button', { name: /保存/ }));
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ expectedUpdatedAt: new Date('2026-08-05T12:00:00.000Z') }),
    );
    const call = mockSave.mock.calls[0][0];
    expect(call.expectedUpdatedAt).toBeInstanceOf(Date);
  });

  // 「新規シート」経由の router.push は key={activeSheetId} の再マウントで編集中 state を
  // 破棄する（シート切替・閲覧へリンクと同じ SPA 内遷移）。CodeRabbit 指摘: 未保存ガードが
  // 作成導線だけ抜けていた（Major/データ消失）ため、confirmDiscardChanges() 経由になったことを検証する。
  it('未保存の変更がある状態で「新規シート」を押すと確認ダイアログを挟み、拒否時は作成ダイアログを開かない', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="t" {...defaultProps} />);
    await user.type(screen.getByPlaceholderText('Markdown を入力...'), '!');
    await user.click(screen.getByRole('button', { name: '新規シート' }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.queryByText('新規シートを作成')).not.toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('未保存の変更があっても確認ダイアログを承諾すれば「新規シート」の作成ダイアログが開く', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="t" {...defaultProps} />);
    await user.type(screen.getByPlaceholderText('Markdown を入力...'), '!');
    await user.click(screen.getByRole('button', { name: '新規シート' }));
    expect(screen.getByText('新規シートを作成')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('未保存の変更が無ければ確認ダイアログを挟まず「新規シート」の作成ダイアログが開く', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="t" {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: '新規シート' }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByText('新規シートを作成')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  // プレビューは別ウィンドウに分離済み（builder-client 内には描画しない）ため、
  // 連結ロジック（assembleMarkdown）は blockToItem 経由で直接ユニットテストする。
  it('隣接 markdown ブロック同士は単一改行(\\n)で結合される', () => {
    // サーバ側 blocksToMarkdown と同じく markdown 分割のラウンドトリップ無損失性を保つ。
    const raw = assembleMarkdown(mdBlocks(['## A', '## B']).map(blockToItem));
    expect(raw).toBe('## A\n## B');
  });

  it('sparse 配列（途中に undefined 要素）でも実際の直前ブロック基準で結合される', () => {
    // items[i - 1] の位置参照だと sparse 配列で直前の undefined 穴を挟んだ際に
    // 実際にレンダリングされた直前ブロックを見失う不具合があった（レビュー指摘）。
    const items = [
      { id: 'markdown-0', type: 'markdown', markdown: '前のブロック。' },
      undefined,
      { id: 'markdown-1', type: 'markdown', markdown: '次のブロック。' },
    ] as unknown as EditorItem[];
    expect(assembleMarkdown(items)).toBe('前のブロック。\n次のブロック。');
  });

  it('markdown と非 markdown の隣接は空行(\\n\\n)で結合される（GFM テーブル認識の回帰テスト）', () => {
    // 単一改行(\n)だと GFM テーブルが直前の段落に lazy continuation として飲み込まれ、
    // テーブル区切り行 (:---:) がそのまま生テキストとして表示される不具合があった
    // （builder-client.tsx の assembleMarkdown 参照）。
    const blocks: Block[] = [
      { id: 'markdown-1', type: 'markdown', order: 0, data: { markdown: '## A' } },
      {
        id: 'table-1',
        type: 'table',
        order: 1,
        data: { columns: [{ label: '項目', align: 'left' }], rows: [['内容']] },
      },
    ];
    const raw = assembleMarkdown(blocks.map(blockToItem));
    expect(raw).toBe('## A\n\n| 項目 |\n| :--- |\n| 内容 |');
  });

  it('markdown ブロック同士でも 2 本目が GFM テーブルで始まる場合は空行(\\n\\n)で結合される', () => {
    // 生 markdown ブロックとして貼られたテーブル（type=markdown だが先頭がテーブル行）は、
    // 単一改行だと直前段落へ lazy continuation として飲み込まれる。共有 blockJoinSeparator
    // で先頭テーブル行を検出し \n\n 区切りにする（サーバ blocksToMarkdown と対称）。
    const blocks: Block[] = [
      { id: 'markdown-0', type: 'markdown', order: 0, data: { markdown: '経歴の概要テキスト。' } },
      {
        id: 'markdown-1',
        type: 'markdown',
        order: 1,
        data: { markdown: '| 言語 | 経験 |\n| :--- | :--- |\n| TS | 3年 |' },
      },
    ];
    const raw = assembleMarkdown(blocks.map(blockToItem));
    expect(raw).toBe('経歴の概要テキスト。\n\n| 言語 | 経験 |\n| :--- | :--- |\n| TS | 3年 |');
  });

  it('「テーブル」追加→セル入力が table ブロックとして保存 payload に入る', async () => {
    const user = userEvent.setup();
    render(<BuilderClient initialBlocks={[]} initialTitle="t" {...defaultProps} />);
    // パレットチップと下部ボタンの両方に「テーブル」ボタンがあるため末尾（下部ボタン）を使う
    const tableBtns = screen.getAllByRole('button', { name: 'テーブル' });
    await user.click(tableBtns[tableBtns.length - 1]);
    // 既定テーブル: 2 列（項目/内容）＋空 1 行。1 行 1 列にセル入力する。
    await user.type(screen.getByLabelText('1行1列'), 'PHP');
    await user.click(screen.getByRole('button', { name: /保存/ }));
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 't',
        sheetId: 'sheet-1',
        blocks: [
          {
            type: 'table',
            data: {
              columns: [
                { label: '項目', align: 'left' },
                { label: '内容', align: 'left' },
              ],
              rows: [['PHP', '']],
            },
          },
        ],
      }),
    );
  });

  it('シート切替（key={activeSheetId} での再マウント）で内容とタイトルが新シートの値にリセットされる', () => {
    // page.tsx は router.push('/builder?sheet=X') による同一ルート遷移で
    // <BuilderClient key={activeSheetId} .../> を再レンダーする。key が
    // activeSheetId 込みでないと state が前シートの値のまま残り、保存時に
    // 別シートを誤った内容で上書きするバグが再発する（page.tsx 参照）。
    const sheetA = { id: 'sheet-a', title: 'シートA', updatedAt: new Date() };
    const sheetB = { id: 'sheet-b', title: 'シートB', updatedAt: new Date() };
    const { rerender } = render(
      <BuilderClient
        key="sheet-a"
        initialBlocks={mdBlocks(['## Aの内容'])}
        initialTitle="シートA"
        sheets={[sheetA, sheetB]}
        activeSheetId="sheet-a"
      />,
    );
    expect((screen.getByPlaceholderText('Markdown を入力...') as HTMLTextAreaElement).value).toBe('## Aの内容');
    expect(screen.getByLabelText('タイトル')).toHaveValue('シートA');

    rerender(
      <BuilderClient
        key="sheet-b"
        initialBlocks={mdBlocks(['## Bの内容'])}
        initialTitle="シートB"
        sheets={[sheetA, sheetB]}
        activeSheetId="sheet-b"
      />,
    );
    expect((screen.getByPlaceholderText('Markdown を入力...') as HTMLTextAreaElement).value).toBe('## Bの内容');
    expect(screen.getByLabelText('タイトル')).toHaveValue('シートB');
  });

  it('スキルブロックのテーブルは overflow-x-auto でラップされる（375px モバイル横スクロール回帰テスト）', () => {
    // ラッパー無しだとテーブルがページ全体を横に押し広げ、/builder が 375px 幅で
    // 横スクロールしてしまう不具合があった（本番実機で scrollWidth 548px > 375px を確認）。
    const skillsBlock: Block[] = [
      {
        id: 'skills-1',
        type: 'skills',
        order: 0,
        data: { category: '言語', skills: [{ name: 'TypeScript', years: 5, level: '実務経験あり' }] },
      },
    ];
    render(<BuilderClient initialBlocks={skillsBlock} initialTitle="t" {...defaultProps} />);
    const table = screen.getByRole('table');
    expect(table.parentElement).toHaveClass('overflow-x-auto');
  });

  it('タイトル入力が保存 payload に反映される', async () => {
    const user = userEvent.setup();
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="旧" {...defaultProps} />);
    const titleInput = screen.getByLabelText('タイトル');
    await user.clear(titleInput);
    await user.type(titleInput, '新タイトル');
    await user.click(screen.getByRole('button', { name: /保存/ }));
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '新タイトル',
        blocks: [{ type: 'markdown', data: { markdown: '## A' } }],
        sheetId: 'sheet-1',
      }),
    );
  });

  // Codex 指摘の回帰テスト: sheet.list は staleTime: 60s の間 initialData を再利用するため、
  // タイトルを変更して保存してもサイドバーは自動では気づかない。保存成功時にタイトルが
  // 変わっていれば utils.sheet.list.invalidate() でサイドバー表示を追従させる。
  it('タイトルを変更して保存すると sheet.list を invalidate する', async () => {
    const user = userEvent.setup();
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="旧" {...defaultProps} />);
    const titleInput = screen.getByLabelText('タイトル');
    await user.clear(titleInput);
    await user.type(titleInput, '新タイトル');
    await user.click(screen.getByRole('button', { name: /保存/ }));
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
  });

  it('タイトルを変えずに保存しても sheet.list は invalidate しない', async () => {
    const user = userEvent.setup();
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="変わらないタイトル" {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /保存/ }));
    expect(mockInvalidate).not.toHaveBeenCalled();
  });
});

describe('BuilderClient 自動保存', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 既定の useFakeTimers() は queueMicrotask/performance まで偽装し React の
    // スケジューラが停止する（テストがタイムアウトする）ため、デバウンスに必要な
    // setTimeout/clearTimeout だけを偽装する。userEvent は fake timers 下で
    // ハングする（本ファイルで実測）ため、入力は fireEvent.change で行う。
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const typeMarkdown = (value: string) =>
    fireEvent.change(screen.getByPlaceholderText('Markdown を入力...'), { target: { value } });

  it('編集停止から 0.6 秒後に自動保存が 1 回だけ走る（デバウンス）', async () => {
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="t" {...defaultProps} />);
    // 連続編集ではタイマーが引き直され、停止前は保存されない
    typeMarkdown('## A 追');
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    typeMarkdown('## A 追記');
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(mockSave).not.toHaveBeenCalled();
    // 最後の編集から 0.6 秒経過でちょうど 1 回保存される
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 't',
        sheetId: 'sheet-1',
        blocks: [{ type: 'markdown', data: { markdown: '## A 追記' } }],
        expectedUpdatedAt: defaultSheet.updatedAt,
      }),
    );
    expect(screen.getByText('保存済み（自動）')).toBeInTheDocument();
    // dirty が解消済みなので、さらに時間が経過しても再保存されない
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  // Codex 指摘の回帰テスト（手動保存側と同じ理由）。自動保存でタイトルが変わった場合も
  // サイドバーの sheet.list を invalidate してタイトルの追従を保証する。
  it('タイトル変更を含む自動保存は sheet.list を invalidate する', async () => {
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="旧" {...defaultProps} />);
    fireEvent.change(screen.getByLabelText('タイトル'), { target: { value: '新タイトル（自動保存）' } });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
  });

  it('内容のみの自動保存（タイトル不変）は sheet.list を invalidate しない', async () => {
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="変わらないタイトル" {...defaultProps} />);
    typeMarkdown('## A 追記');
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it('保存の実行中に編集が入ると、完了後にちょうど 1 回だけ追撃保存する', async () => {
    let resolveFirst!: (value: { updatedAt: Date }) => void;
    mockSave.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="t" {...defaultProps} />);
    typeMarkdown('## Aa');
    // 1 回目の自動保存が開始される（未完了のまま保持）
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(screen.getByText('保存中…')).toBeInTheDocument();
    // 保存中に編集 → デバウンス満了しても実行中なので追撃の予約のみ
    typeMarkdown('## Aab');
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    // 1 回目が完了すると追撃保存がちょうど 1 回走り、保存中の編集分が含まれる
    await act(async () => {
      resolveFirst({ updatedAt: new Date() });
    });
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(mockSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        blocks: [{ type: 'markdown', data: { markdown: '## Aab' } }],
      }),
    );
    // 追撃は 1 回きり（それ以上の再保存は走らない）
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockSave).toHaveBeenCalledTimes(2);
  });

  it('競合の初回で自動保存を恒久停止し、ダイアログではなく競合バナーを表示する', async () => {
    mockSave.mockRejectedValueOnce(trpcClientError('CONFLICT'));
    const confirmSpy = vi.spyOn(window, 'confirm');
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="t" {...defaultProps} />);
    typeMarkdown('## Aa');
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    // 自動保存の競合はダイアログを出さない（インジケータ＋再読み込みボタンで通知）
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByText('競合 — 再読み込みが必要')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument();
    // 以降どれだけ編集してデバウンスが満了しても自動保存は走らない（競合スパム防止）
    typeMarkdown('## Aabc');
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    // バナーは 1 個だけ表示される
    expect(screen.getAllByText('競合 — 再読み込みが必要')).toHaveLength(1);
  });

  it('自動保存の失敗（非競合）は同一内容で無限リトライせず、新しい編集で再試行する', async () => {
    mockSave.mockRejectedValueOnce(trpcClientError('UNAUTHORIZED'));
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="t" {...defaultProps} />);
    typeMarkdown('## Aa');
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    // 失敗はインジケータでユーザーへ通知する
    expect(screen.getByText('自動保存に失敗 — 保存ボタンで再試行')).toBeInTheDocument();
    // 同一内容のままでは status 遷移だけでタイマーが再armされず、時間経過だけでは再試行しない
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    // 新しい編集が入ると再デバウンスして再試行する（2 回目は成功して保存済みになる）
    typeMarkdown('## Aab');
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(screen.getByText('保存済み（自動）')).toBeInTheDocument();
  });

  it('markdown へ落ちないフィールド（プロフィールの所属会社）の編集でも dirty になり自動保存される', async () => {
    const profileBlock: Block[] = [
      {
        id: 'profile-1',
        type: 'profile',
        order: 0,
        data: { name: 'テスト太郎', title: 'エンジニア', pr: '', strengths: [], meta: {} },
      },
    ];
    render(<BuilderClient initialBlocks={profileBlock} initialTitle="t" {...defaultProps} />);
    fireEvent.change(screen.getByLabelText('所属会社'), { target: { value: '株式会社 RITMO' } });
    // markdown 比較の旧スナップショットでは検知できなかった編集が dirty になる
    expect(screen.getByText('未保存の変更')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks: [{ type: 'profile', data: expect.objectContaining({ company: '株式会社 RITMO' }) }],
      }),
    );
  });

  it('案件エディタタブを開いただけでは空 project ブロックが追加されず、dirty にも自動保存にもならない', async () => {
    // ensureProjectBlock 廃止の回帰テスト（issue #128）。ProjectEditor は data 未指定時に
    // {companies:[],items:[]} へフォールバックするため、タブを開くだけではブロックを
    // 追加する必要がない。追加していれば（サーバがもう空ブロックを drop しないため）
    // dirty になり、放置後に自動保存されてしまう。
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="t" {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: '案件エディタ' }));
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockSave).not.toHaveBeenCalled();
    expect(screen.queryByText('未保存の変更')).not.toBeInTheDocument();
  });

  it('全ブロックが空のときは自動保存をスキップする（全消し保存ガード）', async () => {
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="t" {...defaultProps} />);
    // 全内容を消す → dirty だが全ブロック空なので自動保存しない
    typeMarkdown('');
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockSave).not.toHaveBeenCalled();
    expect(screen.getByText('未保存の変更')).toBeInTheDocument();
  });
});
