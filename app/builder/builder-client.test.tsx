import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TRPCClientError } from '@trpc/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '@/db/block';
import type { DocumentSnapshot } from '@/db/document-service';

import BuilderClient, { assembleMarkdown, blockToItem, type EditorItem } from './builder-client';

// TRPCClientError.data.code を実クラスで組み立てる（instanceof チェックを本物にするため）。
function trpcClientError(code: string): TRPCClientError<never> {
  return new TRPCClientError(code, { result: { error: { data: { code } } } } as never);
}

const mockSave = vi.fn().mockResolvedValue({ updatedAt: new Date(), revision: '6' });
const mockCreate = vi.fn().mockResolvedValue({ sheetId: 'new-id' });
const mockRouterPush = vi.fn();
const mockRouterRefresh = vi.fn();
const mockDelete = vi.fn().mockResolvedValue({ ok: true });
const mockBuilderFetch = vi.fn().mockResolvedValue({ status: 'OK', snapshot: { revision: '5' } });
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
    useUtils: () => ({
      sheet: {
        list: { invalidate: mockInvalidate },
        builderState: { fetch: mockBuilderFetch },
      },
    }),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockRouterPush, refresh: mockRouterRefresh }) }));
// テーマ Provider なしで BuilderClient 単体を描画できるようにモック（ダークトグルが useThemeMode を使う）
vi.mock('@/context/theme-context', () => ({ useThemeMode: () => ({ mode: 'light', toggleTheme: vi.fn() }) }));

// markdown ブロック配列から初期 Block[] を作るヘルパ。
const mdBlocks = (markdowns: string[]): Block[] =>
  markdowns.map((markdown, order) => ({ id: `block-${order}`, type: 'markdown', order, data: { markdown } }));

const defaultSheet = { id: 'sheet-1', title: 'テストシート', updatedAt: new Date() };
const defaultProps = { sheets: [defaultSheet], activeSheetId: 'sheet-1', initialRevision: '5' };

describe('BuilderClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('編集不能rawの退避Blobは未知field・配列順・巨大版・空行を保持する', async () => {
    const raw: DocumentSnapshot = {
      sheetId: '00000000-0000-4000-8000-000000000001',
      title: '原文',
      revision: '9007199254740993',
      blocks: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          type: 'future',
          order: 0,
          data: { unknown: [null, '  原文\n\n', { nested: false }], blank: '' },
        },
      ],
      validation: { editable: false, issues: [{ blockId: 'block', path: 'data.unknown', code: 'UNKNOWN_FIELD' }] },
    };
    let downloaded!: Blob;
    const createObjectURL = vi.fn((blob: Blob) => {
      downloaded = blob;
      return 'blob:private-test';
    });
    const NativeURL = URL;
    vi.stubGlobal(
      'URL',
      class extends NativeURL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = vi.fn();
      },
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      render(
        <BuilderClient
          initialBlocks={[]}
          initialTitle={raw.title}
          {...defaultProps}
          activeSheetId={raw.sheetId}
          initialRevision={raw.revision}
          loadFailure="uneditable"
          rawSnapshot={raw}
        />,
      );
      expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'テキスト' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '原文JSONを退避' }));
      expect(downloaded.type).toBe('application/json');
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsText(downloaded);
      });
      expect(JSON.parse(text)).toEqual(raw);
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-test');
      expect(click).toHaveBeenCalledOnce();
      expect(mockSave).not.toHaveBeenCalled();
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('作成の応答喪失後も同じ操作UUIDとブロックUUIDで再試行する', async () => {
    const user = userEvent.setup();
    mockCreate.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce({ sheetId: 'new-id' });
    render(<BuilderClient initialBlocks={mdBlocks(['原文'])} initialTitle="t" {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: '新規シート' }));
    await user.click(screen.getByRole('button', { name: '作成' }));
    await user.click(screen.getByRole('button', { name: '新規シート' }));
    await user.click(screen.getByRole('button', { name: '作成' }));
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate.mock.calls[1][0]).toEqual(mockCreate.mock.calls[0][0]);
    expect(mockCreate.mock.calls[0][0].sheetId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each(['create', 'delete'] as const)('離脱後の%s応答で遷移しない', async (operation) => {
    const user = userEvent.setup();
    let finish!: (value: { sheetId: string }) => void;
    const mutation = operation === 'create' ? mockCreate : mockDelete;
    mutation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      const view = render(<BuilderClient initialBlocks={mdBlocks(['原文'])} initialTitle="t" {...defaultProps} />);
      if (operation === 'create') {
        await user.click(screen.getByRole('button', { name: '新規シート' }));
        await user.click(screen.getByRole('button', { name: '作成' }));
      } else {
        await user.click(screen.getByRole('button', { name: '「テストシート」を削除' }));
      }
      expect(mutation).toHaveBeenCalledOnce();
      view.unmount();
      await act(async () => {
        finish({ sheetId: 'new-id' });
      });
      expect(mockRouterPush).not.toHaveBeenCalled();
      expect(mockRouterRefresh).not.toHaveBeenCalled();
    } finally {
      confirm.mockRestore();
    }
  });

  it('最後のシートも画面が保持する版で削除する', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<BuilderClient initialBlocks={mdBlocks(['原文'])} initialTitle="t" {...defaultProps} initialRevision="0" />);
    const remove = screen.getByRole('button', { name: /テストシート.*削除|削除.*テストシート/ });
    await user.click(remove);
    expect(mockDelete).toHaveBeenCalledWith({ sheetId: defaultProps.activeSheetId, expectedRevision: '0' });
    confirm.mockRestore();
  });

  it('安全整数範囲を超える版を数値変換せず保存する', async () => {
    const user = userEvent.setup();
    mockSave.mockResolvedValueOnce({ revision: '9007199254740994' });
    render(
      <BuilderClient
        initialBlocks={mdBlocks(['原文'])}
        initialTitle="t"
        {...defaultProps}
        initialRevision="9007199254740993"
      />,
    );
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: '9007199254740993' }));
  });

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
        blocks: [{ id: expect.any(String), order: expect.any(Number), type: 'markdown', data: { markdown: '## A' } }],
        sheetId: 'sheet-1',
      }),
    );
  });

  it('期間投影が不一致の下書きを保存APIへ送信しない', async () => {
    const user = userEvent.setup();
    render(
      <BuilderClient
        initialTitle="期間検証"
        {...defaultProps}
        initialBlocks={[
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            type: 'project',
            order: 0,
            data: {
              companies: [{ id: 'c1', name: '検証会社', kind: '', period: '', note: '' }],
              items: [
                {
                  id: 'p1',
                  companyId: 'c1',
                  title: '案件',
                  scope: '',
                  period: '2026.08 — ',
                  ongoing: true,
                  role: '',
                  team: '',
                  tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] },
                  process: [],
                  duties: '',
                  acquired: '',
                  comment: '',
                },
              ],
            },
          },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: /保存/ }));
    expect(mockSave).not.toHaveBeenCalled();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      fireEvent.change(screen.getByLabelText('タイトル'), { target: { value: '下書きの新タイトル' } });
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });
      expect(mockSave).not.toHaveBeenCalled();
      expect(screen.getByLabelText('タイトル')).toHaveValue('下書きの新タイトル');
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });
      expect(mockSave).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: '案件エディタ' }));
      fireEvent.click(screen.getByRole('checkbox', { name: '継続中' }));
      fireEvent.change(screen.getByLabelText('終了月', { selector: 'input' }), { target: { value: '2026-09' } });
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });
      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(mockSave.mock.calls[0][0].blocks[0].data.items[0]).toMatchObject({
        period: '2026.08 — 2026.09',
        periodStart: '2026-08',
        periodEnd: '2026-09',
        ongoing: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('複数 project ブロックの文書で案件編集しても2件目のブロックに複写されない（#353）', async () => {
    const user = userEvent.setup();
    const tech = { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] };
    const projectItem = (id: string, companyId: string, title: string) => ({
      id,
      companyId,
      title,
      scope: '',
      period: '2024.01 — 2024.12',
      role: '',
      team: '',
      tech,
      process: [],
      duties: '',
      acquired: '',
      comment: '',
    });
    render(
      <BuilderClient
        initialTitle="t"
        {...defaultProps}
        initialBlocks={[
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            type: 'project',
            order: 0,
            data: {
              companies: [{ id: 'c1', name: 'A社', kind: '', period: '', note: '' }],
              items: [projectItem('p1', 'c1', '案件A')],
            },
          },
          {
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            type: 'project',
            order: 1,
            data: {
              companies: [{ id: 'c2', name: 'B社', kind: '', period: '', note: '' }],
              items: [projectItem('p2', 'c2', '案件B')],
            },
          },
        ]}
      />,
    );
    // 先頭ブロックの案件だけを編集する
    fireEvent.click(screen.getByRole('button', { name: '案件エディタ' }));
    fireEvent.change(screen.getByLabelText('案件タイトル'), { target: { value: '案件A改' } });
    await user.click(screen.getByRole('button', { name: /保存/ }));
    const blocks = mockSave.mock.calls[0][0].blocks;
    expect(blocks.filter((b: { type: string }) => b.type === 'project')).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: 'project', data: { items: [{ title: '案件A改' }] } });
    // 旧実装は全 project ブロックへ同じ data を複写し、案件B が消えていた
    expect(blocks[1]).toMatchObject({
      type: 'project',
      data: { companies: [{ name: 'B社' }], items: [{ title: '案件B' }] },
    });
  });

  it('文書IDがないビルダーは保存から暗黙作成しない', async () => {
    const user = userEvent.setup();
    render(
      <BuilderClient
        initialBlocks={mdBlocks(['## A'])}
        initialTitle="マイシート"
        sheets={[]}
        activeSheetId=""
        initialRevision="0"
      />,
    );
    await user.click(screen.getByRole('button', { name: /保存/ }));
    expect(mockSave).not.toHaveBeenCalled();
  });

  // R01: 版は本文と同じスナップショット（initialRevision）から取り、保存の期待版として送る。
  // 以前は別読取の一覧 updatedAt を使っていたため、本文と版がずれる設計だった。
  it('initialRevision が保存 mutation の expectedRevision として渡る（R01）', async () => {
    const user = userEvent.setup();
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="マイシート" {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /保存/ }));
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: '5' }));
  });

  it('保存応答の新版で次の保存の期待版が更新される（遅延した古い応答で版が戻らない、R01）', async () => {
    const user = userEvent.setup();
    mockSave.mockResolvedValueOnce({ updatedAt: new Date(), revision: '6' });
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="マイシート" {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /保存/ }));
    await user.click(screen.getByRole('button', { name: /保存/ }));
    expect(mockSave).toHaveBeenLastCalledWith(expect.objectContaining({ expectedRevision: '6' }));
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

  it('推しモードはすべての skills 表で推し列を維持する', () => {
    const items: EditorItem[] = [
      {
        id: 'skills-1',
        type: 'skills',
        category: 'フロントエンド',
        skills: [{ name: 'React', years: 3, level: '実務経験あり', featured: true }],
      },
      { id: 'skills-2', type: 'skills', category: 'その他', skills: [] },
    ];
    const raw = assembleMarkdown(items);
    expect(raw.match(/\| スキル \| 経験年数 \| 習熟度 \| 推し \|/g)).toHaveLength(2);
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
            id: expect.any(String),
            order: 0,
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
        initialRevision="1"
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
        initialRevision="1"
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
        blocks: [{ id: expect.any(String), order: expect.any(Number), type: 'markdown', data: { markdown: '## A' } }],
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

  // chatgpt-codex-connector レビュー指摘: 項目名が空で値だけある行は、ラベル重複と同じ
  // blockedItemIds にまとめられて保存をブロックするが、行単位の aria-invalid・エラー文言は
  // ラベル重複（isConflicting）だけを見ており、この行には何の印も付かず「重複」という
  // 誤った診断だけが画面全体に出ていた。行単位でも実際の理由（未入力）を示すことを確認する。
  it('カスタム項目のラベルが空で値だけある行は、重複メッセージではなく未入力の専用メッセージを表示する', async () => {
    const user = userEvent.setup();
    const profileBlock: Block[] = [
      {
        id: 'profile-1',
        type: 'profile',
        order: 0,
        data: { name: 'テスト太郎', title: 'エンジニア', pr: '', strengths: [], meta: {} },
      },
    ];
    render(<BuilderClient initialBlocks={profileBlock} initialTitle="t" {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: '項目を追加' }));
    await user.type(screen.getByLabelText('値'), 'A型');

    expect(
      screen.getByText('項目名が未入力のため、この項目は保存されません。項目名を入力してください。'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/項目名が他の項目と重複しているため/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('項目名')).toHaveAttribute('aria-invalid', 'true');
  });

  // CodeRabbit レビュー指摘: 通常の `{}` に `meta['__proto__'] = 値` を代入すると、値が
  // 文字列（有効なプロトタイプ値ではない）のため代入が黙って無視され、own property が
  // 作られずラベルごと保存結果から消えていた（実測で確認済み）。ラベルは編集者の自由
  // 入力で `__proto__` を予約語として弾いていないため、通常の入力だけで再現する。
  it('カスタム項目のラベルが __proto__ でも通常のプロパティとして保存される', async () => {
    const user = userEvent.setup();
    const profileBlock: Block[] = [
      {
        id: 'profile-1',
        type: 'profile',
        order: 0,
        data: { name: 'テスト太郎', title: 'エンジニア', pr: '', strengths: [], meta: {} },
      },
    ];
    render(<BuilderClient initialBlocks={profileBlock} initialTitle="t" {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: '項目を追加' }));
    await user.type(screen.getByLabelText('項目名'), '__proto__');
    await user.type(screen.getByPlaceholderText('値'), 'テスト値');
    await user.click(screen.getByRole('button', { name: /保存/ }));

    expect(mockSave).toHaveBeenCalledTimes(1);
    const profileData = mockSave.mock.calls[0][0].blocks[0].data;
    expect(Object.hasOwn(profileData.meta, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(profileData.meta, '__proto__')?.value).toBe('テスト値');
  });

  describe('隣接アイコンボタンの間隔（#192）', () => {
    // AC は「隣接する 44px ボタンの間隔を 8px 以上」。Tailwind の gap-2 が 8px なので、
    // gap-1（4px）へ戻す回帰をクラス指定で固定する（jsdom は実寸を測れないため）。
    it('テーブル列の揃えボタン群と削除ボタンが gap-2（8px）で並ぶ', () => {
      const blocks: Block[] = [
        {
          id: 'table-1',
          type: 'table',
          order: 0,
          data: { columns: [{ label: '列1', align: 'left' }], rows: [['a']] },
        },
      ];
      render(<BuilderClient initialBlocks={blocks} initialTitle="t" {...defaultProps} />);
      const alignButton = screen.getByRole('button', { name: '列1を左揃え' });
      const group = alignButton.parentElement as HTMLElement;
      expect(group.className).toContain('gap-2');
      expect(group.className).not.toMatch(/\bgap-1\b/);
    });

    it('トップバーの操作群が gap-2（8px）で並び、SP では折り返して画面外へ出ない', () => {
      const { container } = render(
        <BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="t" {...defaultProps} />,
      );
      const topbar = container.querySelector('[data-slot="builder-topbar"]') as HTMLElement;
      const row = topbar.querySelector(':scope > div') as HTMLElement;
      const actions = row.children[row.children.length - 1] as HTMLElement;

      expect(actions.className).toContain('gap-2');
      expect(actions.className).not.toMatch(/\bgap-1\b/);

      // 「自動保存に失敗 — 保存ボタンで再試行」は 210px あり、shrink-0 + whitespace-nowrap の
      // ままだと 375px/320px で保存ボタン自体が画面外へ出て押せなくなる（実機実測: 右端394px）。
      // SP だけ折り返しを許可し、sm 以上は従来どおり1行に保つ。
      expect(actions.className).toContain('flex-wrap');
      expect(actions.className).toContain('min-w-0');
      expect(actions.className).toContain('sm:flex-nowrap');
      expect(actions.className).toContain('sm:shrink-0');
      expect(actions.className).not.toMatch(/(?<!sm:)\bshrink-0\b/);
    });

    it('シート一覧の行（選択ボタン + 削除ボタン）が gap-2（8px）で並ぶ', () => {
      render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="t" {...defaultProps} />);
      const deleteButton = screen.getByRole('button', { name: '「テストシート」を削除' });
      const row = deleteButton.closest('li') as HTMLElement;
      expect(row.className).toContain('gap-2');
      expect(row.className).not.toMatch(/\bgap-1\b/);
    });
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
        blocks: [
          { id: expect.any(String), order: expect.any(Number), type: 'markdown', data: { markdown: '## A 追記' } },
        ],
        expectedRevision: '5',
      }),
    );
    expect(screen.getByText('保存済み（自動）')).toBeInTheDocument();
    // dirty が解消済みなので、さらに時間が経過しても再保存されない
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  // R01: 応答の逆順到着。サーバ採番の版は単調増加なので、古い版の応答が後着しても
  // クライアントの版を戻してはいけない（戻すと次回保存が誤 Conflict する）。
  it('古い版の応答が後着しても版を戻さない（R01: 逆順到着対策）', async () => {
    mockSave.mockResolvedValueOnce({ updatedAt: new Date(), revision: '6' });
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="t" {...defaultProps} />);
    typeMarkdown('## A1');
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(mockSave).toHaveBeenLastCalledWith(expect.objectContaining({ expectedRevision: '5' }));

    // 直前より古い版 3 を返す応答（逆順到着の縮約モデル）
    mockSave.mockResolvedValueOnce({ updatedAt: new Date(), revision: '3' });
    typeMarkdown('## A12');
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(mockSave).toHaveBeenLastCalledWith(expect.objectContaining({ expectedRevision: '6' }));

    // 古い応答で版が 3 へ戻っていないことを、次の保存の期待版で確認する
    mockSave.mockResolvedValue({ updatedAt: new Date(), revision: '7' });
    typeMarkdown('## A123');
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(mockSave).toHaveBeenLastCalledWith(expect.objectContaining({ expectedRevision: '6' }));
  });

  // R01: 保存の飛行中に入った編集を、応答ハンドラが誤って「保存済み」へ戻さない。
  // 応答時の dirty 判定は自分のスナップショットではなくライブの items/title と比較する。
  it('保存中に入った編集は応答で dirty が解消されず、追撃保存が最新内容を送る', async () => {
    let resolveSave: (value: { updatedAt: Date; revision: string }) => void = () => {};
    mockSave.mockImplementationOnce(
      () =>
        new Promise<{ updatedAt: Date; revision: string }>((resolve) => {
          resolveSave = resolve;
        }),
    );
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="t" {...defaultProps} />);
    typeMarkdown('## A1');
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);

    // 飛行中の編集 — 古い応答がこの内容を消したり dirty を誤解消してはいけない
    typeMarkdown('## A12');
    await act(async () => {
      resolveSave({ updatedAt: new Date(), revision: '6' });
    });

    mockSave.mockResolvedValue({ updatedAt: new Date(), revision: '7' });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    // 追撃保存は「飛行中に編集した最新内容」と「応答で得た新版」を送る
    expect(mockSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedRevision: '6',
        blocks: [{ id: expect.any(String), order: expect.any(Number), type: 'markdown', data: { markdown: '## A12' } }],
      }),
    );
  });

  // 読み込みに失敗したまま保存すると、sheetId が空のまま既定シートを上書きしてしまう。
  it('読み込みに失敗しているときは自動保存も手動保存もしない', async () => {
    render(
      <BuilderClient
        initialBlocks={mdBlocks([''])}
        initialTitle=""
        sheets={[]}
        activeSheetId=""
        loadFailure="unknown"
        initialRevision="0"
      />,
    );
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    expect(screen.getByLabelText('タイトル')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'テキスト' })).not.toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('文書IDがないビルダーは自動保存から暗黙作成しない', async () => {
    render(
      <BuilderClient
        initialBlocks={mdBlocks(['## A'])}
        initialTitle="t"
        sheets={[]}
        activeSheetId=""
        initialRevision="0"
      />,
    );
    typeMarkdown('## B');
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(mockSave).not.toHaveBeenCalled();
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

  it('シート切替でunmountした後の保存応答から追撃保存を送らない', async () => {
    let resolveFirst!: (value: { revision: string }) => void;
    mockSave.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const view = render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="t" {...defaultProps} />);
    typeMarkdown('## Aa');
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    typeMarkdown('## Aab');
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => {
      resolveFirst({ revision: '6' });
    });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
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
        blocks: [{ id: expect.any(String), order: expect.any(Number), type: 'markdown', data: { markdown: '## Aab' } }],
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
        blocks: [
          {
            id: expect.any(String),
            order: expect.any(Number),
            type: 'profile',
            data: expect.objectContaining({ company: '株式会社 RITMO' }),
          },
        ],
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
