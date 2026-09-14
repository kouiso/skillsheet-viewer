import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SkillSheetDocument } from './skill-sheet-document';

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

  it('4行以下の小さい表に長文セルがあってもスローせず描画できる（行アトミック化の回帰防止）', () => {
    // shouldTableWrap 廃止後、小さい表でも wrap={true} + 各行 wrap={false} で処理されることを確認
    const longCell = 'あ'.repeat(500);
    const content = `## 業務内容\n\n| 項目 | 内容 |\n| :--- | :--- |\n| 説明 | ${longCell} |\n| 補足 | 追加情報 |\n`;
    const { container } = render(<SkillSheetDocument title="テスト" content={content} />);
    expect(container).toBeDefined();
  });
});
