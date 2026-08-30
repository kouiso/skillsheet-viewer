/**
 * DB 由来の印刷デザイン経路（PrintSkillSheetDocument）が、補助面文字（サロゲートペア）
 * を含む氏名・案件名でも直後の文字を潰さないことを固定する（Issue #263 E 系の再発、
 * 案件断片 15）。
 *
 * レガシー markdown 経路（render-nodes.tsx）は toRenderableText を自前で呼んでおり
 * glyph-verify.node.test.tsx 等で別途守られている。この DB 経路は
 * print-primitives.tsx の PrintText が唯一の共通出口で、そこにサニタイズが無いと
 * @react-pdf/renderer 4.5.x のサブセット化バグ（glyph-coverage.ts 参照）で
 * 「𠮟 太郎」が無関係なラテン字形＋「太郎」の潰れた形になる。
 */
import { existsSync } from 'node:fs';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import { getDocument } from 'pdfjs-dist';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Block, ProjectTech } from '@/db/blocks';

import PDF_FONT_FAMILY from './constants';
import { PrintSkillSheetDocument } from './print-document';
import { BOLD_TTF, REGULAR_TTF } from './test-font-paths';

const emptyTech: ProjectTech = { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] };

// U+20B9F（𠮟、CJK 統合漢字拡張 B）。よくある人名用漢字で、cmap には字形があっても
// @react-pdf/renderer のサブセット化・エンコードが壊れる（glyph-coverage.ts のコメント参照）。
const SUPPLEMENTARY_CHAR = '\u{20B9F}';

function blocksWithSupplementaryName(): Block[] {
  return [
    {
      id: 'b1',
      type: 'profile',
      order: 0,
      data: {
        name: `${SUPPLEMENTARY_CHAR} 太郎`,
        title: '',
        pr: '',
        strengths: [],
        meta: {},
        company: '',
      },
    },
    {
      id: 'b2',
      type: 'project',
      order: 1,
      data: {
        companies: [{ id: 'c1', name: 'A 社', kind: '業務委託', period: '2026.01 — 2026.02', note: '' }],
        items: [
          {
            id: 'p1',
            companyId: 'c1',
            title: `${SUPPLEMENTARY_CHAR} 漁業システム`,
            scope: '',
            period: '2026.01 — 2026.02',
            role: '',
            team: '',
            tech: emptyTech,
            process: [],
            duties: '通常の本文。',
            acquired: '',
            comment: '',
          },
        ],
      },
    },
  ];
}

async function extractText(buffer: Buffer): Promise<string> {
  const document = await getDocument({ data: new Uint8Array(buffer) }).promise;
  let text = '';
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    text += content.items.map((item) => ('str' in item ? item.str : '')).join('');
  }
  return text;
}

describe('DB 印刷経路: 補助面文字（サロゲートペア）', () => {
  beforeAll(() => {
    expect(existsSync(REGULAR_TTF)).toBe(true);
    expect(existsSync(BOLD_TTF)).toBe(true);
    Font.register({
      family: PDF_FONT_FAMILY,
      fonts: [
        { src: REGULAR_TTF, fontWeight: 400 },
        { src: BOLD_TTF, fontWeight: 700 },
        { src: REGULAR_TTF, fontWeight: 400, fontStyle: 'italic' },
        { src: BOLD_TTF, fontWeight: 700, fontStyle: 'italic' },
      ],
    });
  });

  it('氏名・案件名の補助面文字が直後の文字を潰さない（そのままか 〓 に倒れる）', { timeout: 60_000 }, async () => {
    const buffer = await renderToBuffer(
      <PrintSkillSheetDocument title="補助面文字テスト" blocks={blocksWithSupplementaryName()} />,
    );
    const extracted = (await extractText(buffer)).replace(/\s+/g, '');

    // 赤くなることを確認済み: print-primitives.tsx の PrintText から
    // sanitizeChildren(rawChildren) 呼び出しを外し、素の rawChildren を PdfTextEx に
    // 渡す形へ戻すと、この 2 件は落ちる（無関係なラテン字形が「太郎」「漁業システム」
    // の直前に送り幅 0 で重なり、〓 にも原文にもならない）。
    expect(extracted, '1 ページ目フッターの氏名（毎ページ繰り返す）').toMatch(/(?:𠮟|〓)太郎/u);
    expect(extracted, '案件名の直後（漁業システム）が潰れていないこと').toMatch(/(?:𠮟|〓)漁業システム/u);

    // 実測で出た壊れ方（無関係なラテン字形）が混入していないことも見ておく。
    expect(extracted).not.toMatch(/BŸ|g=|=€/);
  });
});
