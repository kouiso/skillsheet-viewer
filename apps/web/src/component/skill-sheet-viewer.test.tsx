import type { Block } from '@skillsheet/db/blocks';
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
  useReducedMotion: () => false,
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

  it('連続する skills ブロックを1つのグループにまとめ、空の skills ブロックは描画しない（A4）', async () => {
    const blocks: Block[] = [
      {
        id: 'b1',
        type: 'skills',
        order: 0,
        data: { category: '言語', skills: [{ name: 'TS', years: 3, level: '★★☆' }] },
      },
      {
        id: 'b2',
        type: 'skills',
        order: 1,
        data: { category: 'DB', skills: [{ name: 'PG', years: 2, level: '★☆☆' }] },
      },
      { id: 'b3', type: 'skills', order: 2, data: { category: '空', skills: [] } },
    ];
    render(<SkillSheetViewer skillSheet={{ title: 'テスト', content: '' }} blocks={blocks} />);

    await waitFor(() => {
      expect(screen.getByText('TS')).toBeInTheDocument();
    });

    // 2つの非空 skills ブロックが1つのグリッドコンテナにまとまる（独立カード2個ではない）。
    const categoryHeadings = screen.getAllByText(/^(言語|DB)$/);
    expect(categoryHeadings).toHaveLength(2);
    const containers = new Set(categoryHeadings.map((h) => h.closest('.grid')));
    expect(containers.size).toBe(1);
    expect(containers.has(null)).toBe(false);

    // 空の skills ブロック（category: '空'）はどこにも描画されない。
    expect(screen.queryByText('空')).toBeNull();
  });

  it('複数の markdown ブロックに同じ見出しテキストがあっても id を一意化し、React の重複key警告を出さない', async () => {
    // 各 markdown ブロックは独立した <ReactMarkdown>（rehype-slug も独立実行）で描画されるため、
    // 同じ見出しテキストを持つブロックが複数あると rehype-slug が同一 id を付与してしまう
    // （TableOfContents の key 重複・アンカー衝突の原因になっていた実際のバグの再現）。
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const blocks: Block[] = [
      { id: 'b1', type: 'markdown', order: 0, data: { markdown: '## プロジェクト概要\n\n案件A' } },
      { id: 'b2', type: 'markdown', order: 1, data: { markdown: '## プロジェクト概要\n\n案件B' } },
    ];
    render(<SkillSheetViewer skillSheet={{ title: 'テスト', content: '' }} blocks={blocks} />);

    await waitFor(() => {
      expect(screen.getByText('案件A')).toBeInTheDocument();
      expect(screen.getByText('案件B')).toBeInTheDocument();
    });

    const ids = Array.from(document.querySelectorAll('.markdown-content h2[id]')).map((el) => el.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);

    const duplicateKeyWarning = consoleErrorSpy.mock.calls.some((args) =>
      String(args[0]).includes('Encountered two children with the same key'),
    );
    expect(duplicateKeyWarning).toBe(false);
    consoleErrorSpy.mockRestore();
  });

  it('SkillMatrix グリッドの列最小幅が min(240px,100%) でコンテナ幅を超えない（320px 幅での横スクロール回帰防止）', async () => {
    const blocks: Block[] = [
      {
        id: 'b1',
        type: 'skills',
        order: 0,
        data: { category: '言語', skills: [{ name: 'TS', years: 3, level: '★★☆' }] },
      },
    ];
    const { container } = render(<SkillSheetViewer skillSheet={{ title: 'テスト', content: '' }} blocks={blocks} />);

    await waitFor(() => {
      expect(screen.getByText('TS')).toBeInTheDocument();
    });

    const grid = container.querySelector('[class*="grid-template-columns"]') as HTMLElement;
    expect(grid).not.toBeNull();
    // 固定 240px の minmax だけだと 320px 幅で列自体がコンテナよりはみ出す
    // （実機/Playwright 計測で確認済み）。min() でコンテナ幅を上限にキャップする。
    expect(grid.className).toContain('minmax(min(240px,100%),1fr)');
  });
});
