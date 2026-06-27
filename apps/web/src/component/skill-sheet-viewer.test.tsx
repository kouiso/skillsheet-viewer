import { render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import SkillSheetViewer from './skill-sheet-viewer';

// framer-motion はアニメーション専用 props を除いた素の要素に置換する
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () => {
        const Passthrough = ({ children, ...props }: { children?: ReactNode }) => {
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
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const DETAILS_CONTENT = `## テストセクション

<details open>
<summary><h2>スキル・経験年数</h2></summary>

| 技術分類 | 技術名 |
| :--- | :--- |
| 言語 | TypeScript |

</details>
`;

describe('SkillSheetViewer', () => {
  it('生HTML（<details>/<summary>）を要素として描画し、生HTMLコードを文字列で表示しない', async () => {
    render(<SkillSheetViewer skillSheet={{ title: 'テスト', content: DETAILS_CONTENT }} />);

    // <summary> 内の見出しテキストが「要素」として描画されている。
    // 目次（サイドバー）にも同じ見出しテキストが出るため、本文（.markdown-content）配下に
    // scope して h2 要素の存在を確認する。
    await waitFor(() => {
      const markdown = document.querySelector('.markdown-content') as HTMLElement;
      expect(within(markdown).getByText('スキル・経験年数')).toBeInTheDocument();
    });

    // 生HTMLタグが文字列としてそのまま表示されていないこと（rehype-raw 回帰防止）
    const root = document.querySelector('.markdown-content');
    expect(root?.textContent ?? '').not.toContain('<summary');
    expect(root?.textContent ?? '').not.toContain('<details');
    expect(root?.textContent ?? '').not.toContain('display: inline');

    // details 要素として描画されている
    expect(document.querySelector('details')).not.toBeNull();
    // テーブルも通常どおり描画される
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
  });

  it('GFM の列 alignment を th/td の inline text-align として適用する', async () => {
    const ALIGN_TABLE = `| 左 | 中 | 右 |
| :--- | :---: | ---: |
| a | b | c |
`;
    render(<SkillSheetViewer skillSheet={{ title: 'テスト', content: ALIGN_TABLE }} />);

    await waitFor(() => {
      const markdown = document.querySelector('.markdown-content') as HTMLElement;
      expect(within(markdown).getByText('a')).toBeInTheDocument();
    });

    const markdown = document.querySelector('.markdown-content') as HTMLElement;
    // ヘッダ（th）に列ごとの alignment が反映される
    const headers = Array.from(markdown.querySelectorAll('th')) as HTMLTableCellElement[];
    expect(headers.map((th) => th.style.textAlign)).toEqual(['left', 'center', 'right']);
    // 本文（td）にも同じ alignment が反映される
    const cells = Array.from(markdown.querySelectorAll('tbody td')) as HTMLTableCellElement[];
    expect(cells.map((td) => td.style.textAlign)).toEqual(['left', 'center', 'right']);
  });
});
