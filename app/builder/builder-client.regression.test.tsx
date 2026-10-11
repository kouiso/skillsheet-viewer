import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block, ProjectBlockData } from '@/db/block';
import BuilderClient from './builder-client';
import { type HistoryEntry, historyStorageKey } from './history';

const mockSave = vi.fn().mockResolvedValue({ revision: '6', updatedAt: new Date() });
const mockInvalidate = vi.fn().mockResolvedValue(undefined);
const mockHistoryList = vi.fn();
const mockHistoryRead = vi.fn();
const mockHistoryPreview = vi.fn();
const mockHistoryRestore = vi.fn();
vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    sheet: {
      history: { restore: { useMutation: () => ({ mutateAsync: mockHistoryRestore }) } },
      save: { useMutation: () => ({ mutateAsync: mockSave }) },
      create: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      delete: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      list: { useQuery: (_input: unknown, options: { initialData: unknown }) => ({ data: options.initialData }) },
    },
    useUtils: () => ({
      sheet: {
        list: { invalidate: mockInvalidate },
        builderState: { fetch: vi.fn() },
        history: {
          list: { fetch: mockHistoryList },
          read: { fetch: mockHistoryRead },
          previewRestore: { fetch: mockHistoryPreview },
        },
      },
    }),
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/context/theme-context', () => ({ useThemeMode: () => ({ mode: 'light', toggleTheme: vi.fn() }) }));

const props = {
  initialTitle: '独立回帰用シート',
  initialRevision: '5',
  activeSheetId: 'regression-sheet',
  sheets: [{ id: 'regression-sheet', title: '独立回帰用シート', updatedAt: new Date('2026-01-01T00:00:00Z') }],
};
const project = (id: string, order: number, title = `合成案件${id}`): Extract<Block, { type: 'project' }> => ({
  id,
  type: 'project',
  order,
  data: {
    companies: [{ id: `company-${id}`, name: `合成会社${id}`, kind: '', period: '', note: '' }],
    items: [
      {
        id: `item-${id}`,
        companyId: `company-${id}`,
        title,
        scope: '',
        period: '2024.01 — 2024.12',
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
});
const latestBlocks = (): Block[] => mockSave.mock.calls.at(-1)?.[0].blocks;
const selectProject = (index: number) =>
  fireEvent.click(screen.getAllByRole('button', { name: '経歴（案件）: 経歴（案件）' })[index]);
const openHistory = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'その他の操作' }));
  await user.click(screen.getByRole('button', { name: /この端末の入力履歴/ }));
  return screen.getByRole('dialog', { name: '変更履歴' });
};

// jsdomにはnative dialog APIがない。表示属性だけ補い、履歴部品自体は実物を使う。
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
});
afterAll(() => {
  for (const [name, descriptor] of [
    ['showModal', originalShowModal],
    ['close', originalClose],
  ] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(window.matchMedia).mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});
afterEach(() => {
  localStorage.clear();
});

describe('共通ワークスペースのブロック帰属回帰', () => {
  it('削除Undoは未確定プロフィール値・ID・順序を戻し、削除後の別ブロック編集を上書きしない', async () => {
    const blocks: Block[] = [
      {
        id: 'profile-undo',
        type: 'profile',
        order: 0,
        data: { name: '合成人物', title: '', pr: '', strengths: [], meta: { 独自: '原稿' } },
      },
      { id: 'text-undo', type: 'markdown', order: 1, data: { markdown: '既存の補足' } },
    ];
    render(<BuilderClient {...props} initialBlocks={blocks} />);
    fireEvent.change(screen.getByRole('textbox', { name: '独自' }), { target: { value: '未確定の本人入力' } });
    fireEvent.change(screen.getByRole('textbox', { name: '項目名' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'ブロックを削除' }));
    fireEvent.change(screen.getByPlaceholderText('Markdown を入力...'), { target: { value: '削除後の補足編集' } });
    fireEvent.click(screen.getByRole('button', { name: '削除を取り消す' }));
    expect(screen.getByRole('textbox', { name: '項目名' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: '値' })).toHaveValue('未確定の本人入力');
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(mockSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: '項目名' }), { target: { value: '独自' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(latestBlocks().map((block) => block.id)).toEqual(['profile-undo', 'text-undo']);
    expect(latestBlocks()[0]).toMatchObject({ data: { meta: { 独自: '未確定の本人入力' } } });
    expect(latestBlocks()[1]).toMatchObject({ order: 1, data: { markdown: '削除後の補足編集' } });
  });
  it('profile A→B→Aで自由項目と未確定ドラフトを分離し、保存先へ混入させない', async () => {
    const user = userEvent.setup();
    const blocks: Block[] = ['A', 'B'].map((id, order) => ({
      id: `profile-${id}`,
      type: 'profile',
      order,
      data: { name: `合成人物${id}`, title: '', pr: '', strengths: [], meta: { [`独自${id}`]: `値${id}` } },
    }));
    render(<BuilderClient {...props} initialBlocks={blocks} />);
    fireEvent.change(screen.getByRole('textbox', { name: '独自A' }), { target: { value: 'Aの編集中値' } });
    fireEvent.change(screen.getByRole('textbox', { name: '項目名' }), { target: { value: '' } });
    expect(screen.getByRole('textbox', { name: '項目名' })).toHaveAttribute('aria-invalid', 'true');

    fireEvent.click(screen.getAllByRole('button', { name: 'プロフィール: プロフィール' })[1]);
    expect(screen.getByRole('textbox', { name: '項目名' })).toHaveValue('独自B');
    expect(screen.getByRole('textbox', { name: '独自B' })).toHaveValue('値B');
    fireEvent.change(screen.getByRole('textbox', { name: '独自B' }), { target: { value: 'Bの編集値' } });
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(mockSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: 'プロフィール: プロフィール' })[0]);
    expect(screen.getByRole('textbox', { name: '項目名' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: '値' })).toHaveValue('Aの編集中値');
    fireEvent.change(screen.getByRole('textbox', { name: '項目名' }), { target: { value: '独自A' } });
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(
        (latestBlocks().find((block) => block.id === 'profile-A') as Extract<Block, { type: 'profile' }>).data.meta,
      ).toEqual({ 独自A: 'Aの編集中値' }),
    );
    expect(
      (latestBlocks().find((block) => block.id === 'profile-B') as Extract<Block, { type: 'profile' }>).data.meta,
    ).toEqual({ 独自B: 'Bの編集値' });
  });

  it('文書未反映のprofile値だけの下書きでも履歴復元を止め、編集へ戻ると入力が残る', async () => {
    const user = userEvent.setup();
    const blocks: Block[] = [
      {
        id: 'profile-draft',
        type: 'profile',
        order: 0,
        data: { name: '合成人物', title: '', pr: '', strengths: [], meta: {} },
      },
    ];
    mockHistoryList.mockResolvedValue(
      ['5', '4'].map((revision) => ({
        revision,
        title: props.initialTitle,
        recordedAt: '2026-10-06T00:00:00Z',
        action: 'save',
        restoredFrom: null,
        restoredBefore: null,
      })),
    );
    mockHistoryRead.mockImplementation(async ({ revision }: { revision: string }) => ({
      sheetId: props.activeSheetId,
      title: revision === '4' ? '以前の合成タイトル' : props.initialTitle,
      revision,
      blocks,
      validation: { editable: true, issues: [] },
    }));
    render(<BuilderClient {...props} initialBlocks={blocks} />);
    await user.click(screen.getByRole('button', { name: '項目を追加' }));
    fireEvent.change(screen.getByRole('textbox', { name: '値' }), {
      target: { value: '文書データにはまだ反映していない合成入力' },
    });
    expect(screen.getByRole('textbox', { name: '項目名' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: '項目名' })).toHaveAttribute('aria-invalid', 'true');
    await user.click(screen.getByRole('button', { name: '版の履歴を開く' }));
    expect(screen.queryByRole('region', { name: '版の履歴' })).not.toBeInTheDocument();
    expect(mockHistoryList).not.toHaveBeenCalled();
    expect(mockHistoryPreview).not.toHaveBeenCalled();
    expect(mockHistoryRestore).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: '項目名' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: '値' })).toHaveValue('文書データにはまだ反映していない合成入力');
  });

  it('A案件/B案件/CテキストでB→C→C削除後は表示と保存対象がAへ揃う', async () => {
    const user = userEvent.setup();
    const a = project('A', 0);
    const b = project('B', 1);
    render(
      <BuilderClient
        {...props}
        initialBlocks={[a, b, { id: 'C', type: 'markdown', order: 2, data: { markdown: '合成テキストC' } }]}
      />,
    );
    selectProject(1);
    expect(screen.getByRole('textbox', { name: '案件タイトル' })).toHaveValue('合成案件B');
    fireEvent.click(screen.getByRole('button', { name: 'テキスト: 合成テキストC' }));
    fireEvent.click(screen.getByRole('button', { name: 'ブロックを削除' }));
    expect(screen.getByRole('textbox', { name: '案件タイトル' })).toHaveValue('合成案件A');
    expect(screen.getAllByRole('button', { name: '経歴（案件）: 経歴（案件）' })[0]).toHaveAttribute(
      'aria-current',
      'true',
    );
    fireEvent.change(screen.getByRole('textbox', { name: '案件タイトル' }), { target: { value: '削除後のA編集' } });
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(latestBlocks().map((block) => block.id)).toEqual(['A', 'B']);
    expect(latestBlocks()[0]).toMatchObject({ data: { items: [{ title: '削除後のA編集' }] } });
    expect(latestBlocks()[1]).toEqual(b);
  });

  it.each([
    '並べ替え',
    '先頭削除',
  ] as const)('%s後の再マウントでも履歴は案件IDに帰属し、旧履歴は読み取り専用', async (operation) => {
    const user = userEvent.setup();
    const a = project('A', 0);
    const b = project('B', 1);
    const entries = (id: string): HistoryEntry[] => [
      { id: `${id}-now`, at: Date.now(), label: `${id}専用の最新履歴`, snapshot: project(id, 0).data },
      {
        id: `${id}-old`,
        at: Date.now() - 120000,
        label: `${id}専用の旧履歴`,
        snapshot: project(id, 0, `${id}の復元内容`).data,
      },
    ];
    localStorage.setItem(historyStorageKey(`${props.activeSheetId}:A`), JSON.stringify(entries('A')));
    localStorage.setItem(historyStorageKey(`${props.activeSheetId}:B`), JSON.stringify(entries('B')));
    const legacy: HistoryEntry[] = [
      {
        id: 'legacy',
        at: Date.now() - 3600000,
        label: '帰属不明の旧履歴',
        snapshot: project('legacy', 0).data as ProjectBlockData,
      },
    ];
    const legacyRaw = JSON.stringify(legacy);
    localStorage.setItem(historyStorageKey(props.activeSheetId), legacyRaw);
    const first = render(<BuilderClient {...props} initialBlocks={[a, b]} />);
    const firstDialog = await openHistory(user);
    expect(within(firstDialog).getByText('A専用の旧履歴')).toBeInTheDocument();
    first.unmount();

    const reordered =
      operation === '並べ替え'
        ? [
            { ...b, order: 0 },
            { ...a, order: 1 },
          ]
        : [{ ...b, order: 0 }];
    render(<BuilderClient {...props} initialBlocks={reordered} />);
    const dialog = await openHistory(user);
    expect(within(dialog).getByText('B専用の旧履歴')).toBeInTheDocument();
    expect(within(dialog).queryByText('A専用の旧履歴')).not.toBeInTheDocument();
    const legacySummary = within(dialog).getByText(/以前の端末履歴を確認/);
    fireEvent.click(legacySummary);
    const legacyRegion = legacySummary.closest('details');
    if (!legacyRegion) throw new Error('旧履歴の閲覧領域がありません');
    expect(within(legacyRegion).queryByRole('button', { name: 'この時点に戻す' })).not.toBeInTheDocument();
    expect(within(legacyRegion).getByText(/帰属不明の旧履歴/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'この時点に戻す' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'この時点に戻す' }));
    expect(screen.getByRole('textbox', { name: '案件タイトル' })).toHaveValue('Bの復元内容');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(latestBlocks()[0]).toMatchObject({ id: 'B', data: { items: [{ title: 'Bの復元内容' }] } });
    if (operation === '並べ替え') expect(latestBlocks()[1]).toEqual({ ...a, order: 1 });
    expect(localStorage.getItem(historyStorageKey(props.activeSheetId))).toBe(legacyRaw);
  });
});
