/** 簡約版案件の見出しと本文の改ページを合成データの実 PDF で検証する。 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { Document, Font, Page, renderToBuffer, View } from '@react-pdf/renderer';
import { beforeAll, describe, expect, it } from 'vitest';

import PDF_FONT_FAMILY from './constant';
import { splitForHyphenation } from './font';
import type { Leaf } from './print-leaf';
import { COMPACT_HEADER_TEMPLATE, compactContinuationLeaf, splitLeaf, toLeaves } from './print-leaf-list';
import { measureLeaf, measureLeaves, wrapLeaf } from './print-measure';
import { type PrintPage, paginate } from './print-paginate';
import { printStyles } from './print-primitive';
import { extractQualityPages } from './print-quality-extract.node';
import { PRINT_SIZE } from './print-token';
import type { PrintCompany, PrintProject, PrintViewModel } from './print-view-model';
import { BOLD_TTF, REGULAR_TTF } from './test-font-path';

const CONTENT_HEIGHT = PRINT_SIZE.pageHeight - PRINT_SIZE.padTop - (PRINT_SIZE.padBottom + 14);

function project(overrides: Partial<PrintProject> = {}): PrintProject {
  return {
    id: 'p1',
    index: 1,
    title: '案件タイトル',
    companyName: 'A 社',
    companyLabel: 'A 社',
    periodText: '2025.01〜2025.06',
    compactPeriodText: '2025.01–06',
    durationText: '6ヶ月',
    team: '5 名',
    metaRows: [{ label: '役割', value: 'バックエンド' }],
    techGroups: [{ label: '言語', chips: [{ label: 'TypeScript', emphasis: 'solid' }] }],
    summary: '',
    duties: '業務内容の本文。\n\n- 箇条書き 1\n- 箇条書き 2',
    acquired: '',
    comment: 'コメントの本文。',
    level: 'detail',
    ...overrides,
  };
}

function company(projects: PrintProject[], overrides: Partial<PrintCompany> = {}): PrintCompany {
  return {
    id: 'c1',
    name: 'A 社',
    kind: '',
    kindLabel: '',
    periodText: '2025.01〜2025.06',
    note: '会社概要。',
    projectCount: projects.length,
    roles: '',
    teamRange: '',
    isLatest: true,
    projects,
    ...overrides,
  };
}

function vm(companies: PrintCompany[]): PrintViewModel {
  return {
    summary: {
      sheetTitle: 't',
      name: 'n',
      title: '',
      companyName: '',
      stats: [],
      topSkills: [],
      skillEmphasisMode: 'level',
      processLabels: [],
      profileRows: [],
      expertiseRows: [],
      strengths: [],
      pr: '',
    },
    skillGroups: [],
    companies,
    showProjects: true,
    showSkills: true,
    showProcess: true,
    skillEmphasisMode: 'level',
  };
}

async function renderPages(pages: PrintPage[]) {
  return renderToBuffer(
    <Document>
      {pages.map((page, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: ページは順序で識別する
        <Page key={index} size="A4" style={printStyles.page}>
          {page.leaves.map((placed) => wrapLeaf(placed.leaf))}
        </Page>
      ))}
    </Document>,
  );
}

function compactLeaves(overrides: Partial<PrintProject> = {}) {
  const leaves = toLeaves(vm([company([project({ level: 'compact', title: '境界案件', ...overrides })])]));
  return leaves.slice(leaves.findIndex((leaf) => leaf.kind === 'compact-row'));
}

describe('簡約版の案件見出しの孤立を防ぐ', () => {
  beforeAll(() => {
    Font.register({
      family: PDF_FONT_FAMILY,
      fonts: [
        { src: REGULAR_TTF, fontWeight: 400 },
        { src: BOLD_TTF, fontWeight: 700 },
      ],
    });
    Font.registerHyphenationCallback(splitForHyphenation);
  });

  it('見出しだけが残りに入る場合も最初のメタ本文と次ページへ移り、実 PDF に全情報が一度ずつ残る', async () => {
    const leaves = await measureLeaves(compactLeaves({ duties: '確認本文。', comment: '' }));
    // 実測した行の直後に 1pt だけ残す。旧実装では行だけ前ページに置かれる境界。
    const height = CONTENT_HEIGHT - leaves[0].height - 1;
    const spacer: Leaf = {
      id: 'spacer',
      companyId: leaves[0].companyId,
      groupId: leaves[0].groupId,
      kind: 'paragraph',
      keepWithNext: false,
      splittable: 'never',
      el: <View style={{ height }} />,
    };
    const header = await measureLeaf(COMPACT_HEADER_TEMPLATE);
    const pages = await paginate([await measureLeaf(spacer), ...leaves], {
      contentHeight: CONTENT_HEIGHT,
      split: splitLeaf,
      measure: measureLeaf,
      continuation: compactContinuationLeaf(header),
    });
    expect(pages[1].leaves[0].leadIn).toBe(true);
    const buffer = await renderPages(pages);
    const extracted = await extractQualityPages(buffer);
    const texts = extracted.map((page) => page.map((item) => item.text).join(''));
    // 手元の前後比較だけに使う。CI では実データも成果物も書き出さない。
    if (process.env.PDF_HEADING_EVIDENCE) {
      mkdirSync(process.env.PDF_HEADING_EVIDENCE, { recursive: true, mode: 0o700 });
      writeFileSync(`${process.env.PDF_HEADING_EVIDENCE}/boundary.pdf`, buffer, { mode: 0o600 });
      writeFileSync(`${process.env.PDF_HEADING_EVIDENCE}/pages.json`, JSON.stringify(texts), { mode: 0o600 });
    }
    expect(texts).toHaveLength(2);
    expect(texts[0]).not.toContain('境界案件');
    expect(texts[1]).toContain('境界案件');
    expect(texts[1]).toContain('期間：6ヶ月');
    expect(texts[1]).toContain('確認本文。');
    for (const marker of ['境界案件', '期間：6ヶ月', 'TypeScript', '確認本文。']) {
      expect(texts.join('').split(marker)).toHaveLength(2);
    }
    expect(
      pages.flatMap((page) => page.leaves.filter((placed) => !placed.leadIn).map((placed) => placed.leaf.id)),
    ).toEqual(['spacer', ...leaves.map((leaf) => leaf.id)]);
  });

  it('本文が空なら次案件を連結せず、末尾の行も欠落しない', async () => {
    const empty = compactLeaves({ durationText: '', metaRows: [], techGroups: [], duties: '', comment: '' });
    expect(empty).toHaveLength(1);
    expect(empty[0].keepWithNext).toBe(false);
    const pages = await paginate(await measureLeaves(empty), {
      contentHeight: CONTENT_HEIGHT,
      split: splitLeaf,
      measure: measureLeaf,
    });
    const texts = (await extractQualityPages(await renderPages(pages)))
      .flat()
      .map((item) => item.text)
      .join('');
    expect(texts.split('境界案件')).toHaveLength(2);
  });

  it('メタ情報と技術が空でも小見出しの先の本文まで同じページへ移す', async () => {
    const leaves = await measureLeaves(
      compactLeaves({ durationText: '', metaRows: [], techGroups: [], duties: '本文開始。', comment: '' }),
    );
    const height = CONTENT_HEIGHT - leaves[0].height - 1;
    const spacer = await measureLeaf({
      id: 'before-section',
      companyId: 'synthetic',
      kind: 'paragraph',
      keepWithNext: false,
      splittable: 'never',
      el: <View style={{ height }} />,
    });
    const pages = await paginate([spacer, ...leaves], {
      contentHeight: CONTENT_HEIGHT,
      split: splitLeaf,
      measure: measureLeaf,
    });
    const texts = (await extractQualityPages(await renderPages(pages))).map((page) =>
      page.map((item) => item.text).join(''),
    );
    expect(texts).toHaveLength(2);
    expect(texts[0]).not.toContain('境界案件');
    expect(texts[1]).toContain('境界案件');
    expect(texts[1]).toContain('担当業務');
    expect(texts[1]).toContain('本文開始。');
  });

  it('会社から本文までの連鎖がページを超えても停止し、葉を順序通り一度ずつ出す', async () => {
    const leaves = await measureLeaves(
      toLeaves(vm([company([project({ level: 'compact', duties: '確認本文。', comment: '' })])])),
    );
    const rowIndex = leaves.findIndex((leaf) => leaf.kind === 'compact-row');
    const chainHeight = leaves
      .slice(0, rowIndex + 2)
      .reduce((sum, leaf) => sum + leaf.height + leaf.marginTop + leaf.marginBottom, 0);
    const contentHeight = chainHeight - 1;
    expect(leaves.every((leaf) => leaf.height + leaf.marginTop + leaf.marginBottom < contentHeight)).toBe(true);
    const pages = await paginate(leaves, { contentHeight, split: splitLeaf, measure: measureLeaf });
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((page) => page.leaves.map((placed) => placed.leaf.id))).toEqual(leaves.map((leaf) => leaf.id));
    expect(pages.every((page) => page.usedHeight <= contentHeight + 0.01)).toBe(true);
    const texts = (await extractQualityPages(await renderPages(pages)))
      .flat()
      .map((item) => item.text)
      .join('');
    for (const marker of ['案件タイトル', '期間：6ヶ月', '確認本文。']) expect(texts.split(marker)).toHaveLength(2);
  });
});
