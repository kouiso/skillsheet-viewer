import type { ReactNode } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
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

    // <summary> 内の見出しテキストが「要素」として描画されている
    await waitFor(() => {
      expect(screen.getByText('スキル・経験年数')).toBeInTheDocument();
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
});
