import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SkillSheetDocument } from './skill-sheet-document';
import { shouldTableWrap } from './table-layout';

describe('shouldTableWrap', () => {
  // react-pdf の getWrap は wrap が undefined だと折返し不可になるため、
  // wrap には必ず boolean を渡す必要がある（このバグの回帰防止）。
  it('常に boolean を返す（undefined を返さない）', () => {
    for (const n of [0, 1, 4, 5, 10, 40, 100]) {
      expect(typeof shouldTableWrap(n)).toBe('boolean');
    }
  });

  it('小さい表（4行以下）は折り返さない（false）', () => {
    expect(shouldTableWrap(2)).toBe(false);
    expect(shouldTableWrap(3)).toBe(false);
    expect(shouldTableWrap(4)).toBe(false);
  });

  it('背の高い表（5行以上）は折り返す（true）— ページ高さ超過時のレイアウト崩れを防ぐ', () => {
    expect(shouldTableWrap(5)).toBe(true);
    expect(shouldTableWrap(11)).toBe(true);
    expect(shouldTableWrap(40)).toBe(true);
  });
});

describe('SkillSheetDocument', () => {
  it('ページ高さを超えうる大きなテーブルを含む内容でもスローせず描画できる', () => {
    const rows = Array.from({ length: 40 }, (_, i) => `| 技術${i} | ${i}年 |`).join('\n');
    const content = `## スキル\n\n| 技術 | 年数 |\n| :--- | :--- |\n${rows}\n`;
    const { container } = render(<SkillSheetDocument title="テスト" content={content} />);
    expect(container).toBeDefined();
  });

  it('段落内ソフト改行を含む複数行パラグラフを描画できる', () => {
    const content = ['段落1行目', '段落2行目', '', '次の段落'].join('\n');
    const { container } = render(<SkillSheetDocument title="テスト" content={content} />);
    expect(container).toBeDefined();
  });
});
