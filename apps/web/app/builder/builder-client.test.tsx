import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import BuilderClient from './builder-client';

// 重いビューア（lightbox/IntersectionObserver 依存）はプレビュー描画を素朴にモック
vi.mock('@/component/skill-sheet-viewer', () => ({
  default: ({ skillSheet }: { skillSheet: { content: string } }) => (
    <div data-testid="preview">{skillSheet.content}</div>
  ),
}));

const mockSave = vi.fn().mockResolvedValue({ ok: true });
vi.mock('./actions', () => ({
  saveBlocksAction: (markdowns: string[]) => mockSave(markdowns),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('BuilderClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('初期ブロックがテキストエリアとして表示される', () => {
    render(<BuilderClient initialMarkdowns={['## A', '## B']} />);
    const areas = screen.getAllByPlaceholderText('Markdown を入力...') as HTMLTextAreaElement[];
    expect(areas).toHaveLength(2);
    expect(areas[0].value).toBe('## A');
    expect(areas[1].value).toBe('## B');
  });

  it('「ブロック追加」で空ブロックが増える', async () => {
    const user = userEvent.setup();
    render(<BuilderClient initialMarkdowns={['## A']} />);
    await user.click(screen.getByRole('button', { name: 'ブロック追加' }));
    expect(screen.getAllByPlaceholderText('Markdown を入力...')).toHaveLength(2);
  });

  it('削除ボタンでブロックが減る', async () => {
    const user = userEvent.setup();
    render(<BuilderClient initialMarkdowns={['## A', '## B']} />);
    await user.click(screen.getAllByLabelText('ブロックを削除')[0]);
    const areas = screen.getAllByPlaceholderText('Markdown を入力...') as HTMLTextAreaElement[];
    expect(areas).toHaveLength(1);
    expect(areas[0].value).toBe('## B');
  });

  it('保存ボタンで現在のブロックが saveBlocksAction に渡る', async () => {
    const user = userEvent.setup();
    render(<BuilderClient initialMarkdowns={['## A']} />);
    await user.click(screen.getByRole('button', { name: /保存/ }));
    expect(mockSave).toHaveBeenCalledWith(['## A']);
  });

  it('プレビューに連結 Markdown が反映される', () => {
    render(<BuilderClient initialMarkdowns={['## A', '## B']} />);
    expect(screen.getByTestId('preview')).toHaveTextContent('## A ## B');
  });
});
