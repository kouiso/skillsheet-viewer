import type { Block } from '@skillsheet/db/blocks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import BuilderClient from './builder-client';

// 重いビューア（lightbox/IntersectionObserver 依存）はプレビュー描画を素朴にモック
vi.mock('@/component/skill-sheet-viewer', () => ({
  default: ({ skillSheet }: { skillSheet: { content: string } }) => (
    <div data-testid="preview">{skillSheet.content}</div>
  ),
}));

const mockSave = vi.fn().mockResolvedValue({ ok: true });
vi.mock('./actions', () => ({
  saveBlocksAction: (payload: { title: string; blocks: unknown[] }) => mockSave(payload),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// markdown ブロック配列から初期 Block[] を作るヘルパ。
const mdBlocks = (markdowns: string[]): Block[] =>
  markdowns.map((markdown, order) => ({ id: `block-${order}`, type: 'markdown', order, data: { markdown } }));

describe('BuilderClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('初期 markdown ブロックがテキストエリアとして表示される', () => {
    render(<BuilderClient initialBlocks={mdBlocks(['## A', '## B'])} initialTitle="t" />);
    const areas = screen.getAllByPlaceholderText('Markdown を入力...') as HTMLTextAreaElement[];
    expect(areas).toHaveLength(2);
    expect(areas[0].value).toBe('## A');
    expect(areas[1].value).toBe('## B');
  });

  it('「テキスト」で空ブロックが増える', async () => {
    const user = userEvent.setup();
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="t" />);
    await user.click(screen.getByRole('button', { name: 'テキスト' }));
    expect(screen.getAllByPlaceholderText('Markdown を入力...')).toHaveLength(2);
  });

  it('削除ボタンでブロックが減る', async () => {
    const user = userEvent.setup();
    render(<BuilderClient initialBlocks={mdBlocks(['## A', '## B'])} initialTitle="t" />);
    await user.click(screen.getAllByLabelText('ブロックを削除')[0]);
    const areas = screen.getAllByPlaceholderText('Markdown を入力...') as HTMLTextAreaElement[];
    expect(areas).toHaveLength(1);
    expect(areas[0].value).toBe('## B');
  });

  it('保存ボタンで {title, blocks} が saveBlocksAction に渡る', async () => {
    const user = userEvent.setup();
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="マイシート" />);
    await user.click(screen.getByRole('button', { name: /保存/ }));
    expect(mockSave).toHaveBeenCalledWith({
      title: 'マイシート',
      blocks: [{ type: 'markdown', data: { markdown: '## A' } }],
    });
  });

  it('プレビューに連結 Markdown が反映される', () => {
    render(<BuilderClient initialBlocks={mdBlocks(['## A', '## B'])} initialTitle="t" />);
    expect(screen.getByTestId('preview')).toHaveTextContent('## A ## B');
  });

  it('「テーブル」追加→セル入力が table ブロックとして保存 payload に入る', async () => {
    const user = userEvent.setup();
    render(<BuilderClient initialBlocks={[]} initialTitle="t" />);
    await user.click(screen.getByRole('button', { name: 'テーブル' }));
    // 既定テーブル: 2 列（項目/内容）＋空 1 行。1 行 1 列にセル入力する。
    await user.type(screen.getByLabelText('1行1列'), 'PHP');
    await user.click(screen.getByRole('button', { name: /保存/ }));
    expect(mockSave).toHaveBeenCalledWith({
      title: 't',
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
    });
  });

  it('タイトル入力が保存 payload に反映される', async () => {
    const user = userEvent.setup();
    render(<BuilderClient initialBlocks={mdBlocks(['## A'])} initialTitle="旧" />);
    const titleInput = screen.getByLabelText('タイトル');
    await user.clear(titleInput);
    await user.type(titleInput, '新タイトル');
    await user.click(screen.getByRole('button', { name: /保存/ }));
    expect(mockSave).toHaveBeenCalledWith({
      title: '新タイトル',
      blocks: [{ type: 'markdown', data: { markdown: '## A' } }],
    });
  });
});
