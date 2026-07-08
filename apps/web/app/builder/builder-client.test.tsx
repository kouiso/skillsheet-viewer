import type { Block } from '@skillsheet/db/blocks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import BuilderClient from './builder-client';

// 重いビューア（lightbox/IntersectionObserver 依存）はプレビュー描画を素朴にモック
vi.mock('@/component/skill-sheet-viewer', () => ({
  default: ({ skillSheet }: { skillSheet: { content: string } }) => (
    <div data-testid="preview" data-raw={skillSheet.content}>
      {skillSheet.content}
    </div>
  ),
}));

const mockSave = vi.fn().mockResolvedValue({ ok: true });
vi.mock('./actions', () => ({
  saveBlocksAction: (payload: { title: string; blocks: unknown[]; sheetId?: string }) => mockSave(payload),
  createSheetAction: vi.fn().mockResolvedValue({ ok: true, sheetId: 'new-id' }),
  deleteSheetAction: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

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

  it('保存ボタンで {title, blocks, sheetId} が saveBlocksAction に渡る', async () => {
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

  it('プレビューに連結 Markdown が反映される', () => {
    render(<BuilderClient initialBlocks={mdBlocks(['## A', '## B'])} initialTitle="t" {...defaultProps} />);
    expect(screen.getByTestId('preview')).toHaveTextContent('## A ## B');
  });

  it('ブロック間は空行(\\n\\n)で結合される（GFM テーブル認識の回帰テスト）', () => {
    // 単一改行(\n)だと GFM テーブルが直前の段落に lazy continuation として飲み込まれ、
    // テーブル区切り行 (:---:) がそのまま生テキストとして表示される不具合があった
    // （builder-client.tsx の assembleMarkdown 参照）。
    render(<BuilderClient initialBlocks={mdBlocks(['## A', '## B'])} initialTitle="t" {...defaultProps} />);
    const raw = screen.getByTestId('preview').getAttribute('data-raw');
    expect(raw).toBe('## A\n\n## B');
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
});
