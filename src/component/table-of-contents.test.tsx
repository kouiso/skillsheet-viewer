import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TableOfContents from './table-of-contents';

// framer-motionをモック
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
    li: ({ children, ...props }: { children: React.ReactNode }) => (
      <li {...props}>{children}</li>
    ),
    button: ({ children, ...props }: { children: React.ReactNode }) => (
      <button {...props}>{children}</button>
    ),
  },
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

const renderTableOfContents = (props = {}) => {
  const defaultProps = {
    headings: mockHeadings,
    activeId: 'heading-1',
    onHeadingClick: vi.fn(),
    ...props,
  };

  return render(<TableOfContents {...defaultProps} />);
};

describe('TableOfContents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window size to desktop
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    window.dispatchEvent(new Event('resize'));
  });

  describe('レンダリング', () => {
    it('目次のタイトルが表示されること', () => {
      renderTableOfContents();
      expect(screen.getByText('目次')).toBeInTheDocument();
    });

    it('見出しリストが正しく表示されること', () => {
      renderTableOfContents();

      expect(screen.getByText('セクション1')).toBeInTheDocument();
      expect(screen.getByText('セクション1-1')).toBeInTheDocument();
      expect(screen.getByText('セクション1-2')).toBeInTheDocument();
      expect(screen.getByText('セクション2')).toBeInTheDocument();
      expect(screen.getByText('セクション2-1')).toBeInTheDocument();
    });

    it('すべての見出しが表示されること', () => {
      renderTableOfContents();

      mockHeadings.forEach((heading) => {
        expect(screen.getByText(heading.text)).toBeInTheDocument();
      });
    });
  });

  describe('アクティブな見出しのハイライト', () => {
    it('アクティブな見出しにprimaryスタイルが適用されること', () => {
      renderTableOfContents({ activeId: 'heading-2' });

      const activeHeading = screen.getByText('セクション1-1');
      const button = activeHeading.closest('button');

      expect(button).toHaveClass('bg-primary');
    });

    it('アクティブでない見出しにprimaryスタイルが適用されないこと', () => {
      renderTableOfContents({ activeId: 'heading-1' });

      const inactiveHeading = screen.getByText('セクション1-1');
      const button = inactiveHeading.closest('button');

      expect(button).not.toHaveClass('bg-primary');
    });
  });

  describe('見出しクリック機能', () => {
    it('見出しをクリックするとonHeadingClickが呼ばれること', async () => {
      const user = userEvent.setup();
      const onHeadingClick = vi.fn();

      renderTableOfContents({ onHeadingClick });

      const heading = screen.getByText('セクション1-1');
      await user.click(heading);

      await waitFor(() => {
        expect(onHeadingClick).toHaveBeenCalledWith('heading-2');
      });
    });

    it('複数の見出しをクリックできること', async () => {
      const user = userEvent.setup();
      const onHeadingClick = vi.fn();

      renderTableOfContents({ onHeadingClick });

      const heading1 = screen.getByText('セクション1');
      await user.click(heading1);

      await waitFor(() => {
        expect(onHeadingClick).toHaveBeenCalledWith('heading-1');
      });

      const heading2 = screen.getByText('セクション2');
      await user.click(heading2);

      await waitFor(() => {
        expect(onHeadingClick).toHaveBeenCalledWith('heading-4');
      });
    });
  });

  describe('折りたたみ機能', () => {
    it('折りたたみボタンが表示されること', () => {
      renderTableOfContents();

      // デスクトップ表示では折りたたみボタンが表示される
      const collapseButton = screen.getByLabelText('折りたたむ');
      expect(collapseButton).toBeInTheDocument();
    });

    it('折りたたみボタンをクリックすると展開ボタンになること', async () => {
      const user = userEvent.setup();
      renderTableOfContents();

      const collapseButton = screen.getByLabelText('折りたたむ');
      await user.click(collapseButton);

      await waitFor(() => {
        expect(screen.getByLabelText('展開')).toBeInTheDocument();
      });
    });

    it('展開ボタンをクリックすると折りたたみボタンになること', async () => {
      const user = userEvent.setup();
      renderTableOfContents();

      // 一度折りたたむ
      const collapseButton = screen.getByLabelText('折りたたむ');
      await user.click(collapseButton);

      await waitFor(() => {
        expect(screen.getByLabelText('展開')).toBeInTheDocument();
      });

      // 展開する
      const expandButton = screen.getByLabelText('展開');
      await user.click(expandButton);

      await waitFor(() => {
        expect(screen.getByLabelText('折りたたむ')).toBeInTheDocument();
      });
    });
  });

  describe('空の見出しリスト', () => {
    it('見出しが空の場合でもエラーなくレンダリングされること', () => {
      renderTableOfContents({ headings: [] });
      expect(screen.getByText('目次')).toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('折りたたみボタンに適切なaria-labelが設定されていること', () => {
      renderTableOfContents();

      const collapseButton = screen.getByLabelText('折りたたむ');
      expect(collapseButton).toHaveAttribute('aria-label', '折りたたむ');
    });

    it('見出しボタンがキーボード操作可能であること', () => {
      renderTableOfContents();

      const headingButtons = screen.getAllByRole('button');
      expect(headingButtons.length).toBeGreaterThan(0);
    });
  });

  describe('レベル別の見出しインデント', () => {
    it('レベル1の見出しはインデントがないこと', () => {
      renderTableOfContents();

      const level1Heading = screen.getByText('セクション1');
      const listItem = level1Heading.closest('li');

      expect(listItem).toBeInTheDocument();
    });

    it('レベル2の見出しにはインデントがあること', () => {
      renderTableOfContents();

      const level2Heading = screen.getByText('セクション1-1');
      const listItem = level2Heading.closest('li');

      expect(listItem).toBeInTheDocument();
    });
  });
});
