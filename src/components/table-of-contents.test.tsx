import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render-with-providers';

import TableOfContents from './table-of-contents';

interface Heading {
  id: string;
  text: string;
  level: number;
}

const mockHeadings: Heading[] = [
  { id: 'heading-1', text: 'セクション1', level: 1 },
  { id: 'heading-2', text: 'セクション1-1', level: 2 },
  { id: 'heading-3', text: 'セクション1-2', level: 2 },
  { id: 'heading-4', text: 'セクション2', level: 1 },
  { id: 'heading-5', text: 'セクション2-1', level: 2 },
];

const renderToc = (props = {}) => {
  const defaultProps = {
    headings: mockHeadings,
    activeId: 'heading-1',
    onHeadingClick: vi.fn(),
    ...props,
  };
  return { ...renderWithProviders(<TableOfContents {...defaultProps} />), props: defaultProps };
};

describe('TableOfContents（デスクトップ表示）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // matchMedia は setup.ts で matches:false → デスクトップ表示
  });

  it('見出しラベル「Contents」が表示されること', () => {
    renderToc();
    expect(screen.getByText('Contents')).toBeInTheDocument();
  });

  it('全ての見出しがボタンとして表示されること', () => {
    renderToc();
    for (const h of mockHeadings) {
      expect(screen.getByRole('button', { name: h.text })).toBeInTheDocument();
    }
  });

  it('見出しクリックで onHeadingClick が呼ばれること', async () => {
    const user = userEvent.setup();
    const { props } = renderToc();
    await user.click(screen.getByRole('button', { name: 'セクション2' }));
    expect(props.onHeadingClick).toHaveBeenCalledWith('heading-4');
  });

  it('折りたたむと文字は消えるが、行そのものは残る（現在位置が分かる）', async () => {
    const user = userEvent.setup();
    renderToc();
    expect(screen.getByText('セクション1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '目次を折りたたむ' }));
    expect(screen.queryByText('セクション1')).not.toBeInTheDocument();
    // 見出しの行は残る（折りたたみボタン 1 個 + 見出し 5 行）
    expect(screen.getAllByRole('button')).toHaveLength(mockHeadings.length + 1);

    await user.click(screen.getByRole('button', { name: '目次を開く' }));
    expect(screen.getByText('セクション1')).toBeInTheDocument();
  });

  it('アクティブな見出しに accent-soft 背景が付くこと', () => {
    renderToc({ activeId: 'heading-4' });
    const activeBtn = screen.getByRole('button', { name: 'セクション2' });
    expect(activeBtn.className).toContain('bg-accent-soft');
    expect(activeBtn.className).toContain('text-accent-text');
  });

  it('3階層目の見出しは 1 段下げて表示する', () => {
    renderToc({ headings: [{ id: 'h3', text: '深い見出し', level: 3 }] });
    expect(screen.getByRole('button', { name: '深い見出し' }).className).toContain('pl-[26px]');
  });
});
