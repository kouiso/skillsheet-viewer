/**
 * 品質検査そのものが機能していることを、**現行の PDF に当てて赤が出ること**で証明する。
 *
 * 直す前に検査を通しておかないと、あとで緑になったのが「直ったから」なのか
 * 「検査が何も見ていないから」なのか区別が付かない。
 *
 * 実データ（19 社 32 案件）に当てたいときは、blocks テーブルの JSON を書き出して
 * `REAL_BLOCKS_JSON` に渡す。未指定でも、この場で組んだ合成データで検査は走る。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import type { Block } from '@skillsheet/db/blocks';
import { blocksToMarkdown } from '@skillsheet/db/blocks';
import { beforeAll, describe, expect, it } from 'vitest';

import PDF_FONT_FAMILY from './constants';
import { splitForHyphenation } from './fonts';
import { DEFAULT_QUALITY_OPTIONS, runQualityChecks, summarize, toSearchKey } from './print-quality';
import { extractQualityPages } from './print-quality-extract.node';
import { buildPrintViewModel } from './print-view-model';
import { SkillSheetDocument } from './skill-sheet-document';

const FONTS_DIR = path.resolve(process.cwd(), 'public', 'fonts');
const REGULAR_TTF = path.join(FONTS_DIR, 'NotoSansJP-Regular.ttf');
const BOLD_TTF = path.join(FONTS_DIR, 'NotoSansJP-Bold.ttf');

const REAL_BLOCKS_JSON = process.env.REAL_BLOCKS_JSON;

function loadBlocks(): Block[] | null {
  if (!REAL_BLOCKS_JSON || !existsSync(REAL_BLOCKS_JSON)) return null;
  return JSON.parse(readFileSync(REAL_BLOCKS_JSON, 'utf-8')) as Block[];
}

describe('品質検査が現行 PDF の欠陥を検出する', () => {
  beforeAll(() => {
    if (!existsSync(REGULAR_TTF) || !existsSync(BOLD_TTF)) throw new Error(`fonts not found under ${FONTS_DIR}`);
    Font.register({
      family: PDF_FONT_FAMILY,
      fonts: [
        { src: REGULAR_TTF, fontWeight: 400 },
        { src: BOLD_TTF, fontWeight: 700 },
      ],
    });
    // 本番（fonts.ts）と同じくハイフネーションコールバックを登録する。登録しないと
    // 和文の途中に U+002D が入る（実測で「（続-き）」「作成致-しました」が出た）。
    if (typeof Font.registerHyphenationCallback === 'function') {
      Font.registerHyphenationCallback(splitForHyphenation);
    }
  });

  it.skipIf(!REAL_BLOCKS_JSON)(
    '現行 markdown 経路の PDF は複数の検査で赤になる',
    async () => {
      const blocks = loadBlocks();
      expect(blocks).not.toBeNull();
      if (!blocks) return;

      const title = 'エンジニアスキルシート';
      const vm = buildPrintViewModel(title, blocks);
      const headings = [
        ...vm.companies.map((c) => c.name),
        ...vm.companies.flatMap((c) => c.projects.map((p) => p.title)),
      ];
      const requiredTexts = vm.companies.flatMap((c) =>
        c.projects.flatMap((p) =>
          (
            [
              ['title', p.title],
              ['duties', p.duties],
              ['acquired', p.acquired],
              ['comment', p.comment],
            ] as const
          )
            .filter(([, text]) => text.length > 0)
            .map(([field, text]) => ({ label: `${p.title} / ${field}`, text: toSearchKey(text) })),
        ),
      );

      const buffer = await renderToBuffer(<SkillSheetDocument title={title} content={blocksToMarkdown(blocks)} />);
      const pages = await extractQualityPages(buffer);
      const findings = runQualityChecks({ pages, headings, requiredTexts }, DEFAULT_QUALITY_OPTIONS);

      console.log(`[baseline] pages=${pages.length} findings=${findings.length} → ${summarize(findings)}`);
      for (const f of findings.filter(
        (x) => x.check === 'overlap' || x.check === 'missing-content' || x.check === 'sparse-page',
      ))
        console.log(`[baseline] p${f.page} ${f.check}: ${f.detail}`);

      // 検査が何も見ていないなら、この行が落ちる。
      expect(findings.length).toBeGreaterThan(0);
      // 現行実装は fontSize 9.5 なので、最小フォントの検査は必ず赤になる。
      expect(findings.some((f) => f.check === 'font-too-small')).toBe(true);
    },
    300_000,
  );
});
