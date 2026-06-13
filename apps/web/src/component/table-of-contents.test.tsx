import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render-with-providers';

import TableOfContents from './table-of-contents';

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () => {
        const Passthrough = ({ children, ...props }: { children?: React.ReactNode }) => {
          const rest = { ...props } as Record<string, unknown>;
          for (const key of ['initial', 'animate', 'transition', 'whileHover', 'whileTap', 'exit', 'variants']) {
            delete rest[key];
          }
          return <div {...rest}>{children}</div>;
        };
        return Passthrough;
      },
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

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

  it('「目次」見出しが表示されること', () => {
    renderToc();
    expect(screen.getByText('目次')).toBeInTheDocument();
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

  it('折りたたみボタンで一覧の表示/非表示が切り替わること', async () => {
    const user = userEvent.setup();
    renderToc();
    expect(screen.getByRole('button', { name: 'セクション1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '折りたたむ' }));
    expect(screen.queryByRole('button', { name: 'セクション1' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '展開' }));
    expect(screen.getByRole('button', { name: 'セクション1' })).toBeInTheDocument();
  });

  it('アクティブな見出しに primary 背景クラスが付くこと', () => {
    renderToc({ activeId: 'heading-4' });
    const activeBtn = screen.getByRole('button', { name: 'セクション2' });
    expect(activeBtn.className).toContain('bg-primary');
  });
});
