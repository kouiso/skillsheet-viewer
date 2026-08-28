/**
 * 新しい印刷経路の PDF を実データで描き、提出できる状態か（品質検査 7 項目）を測る。
 *
 * `REAL_BLOCKS_JSON` に blocks テーブルの JSON を渡したときだけ走る。
 * 反復中はここを回し、`missing-content` が 0 になることで「全件全文」を機械保証する。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import type { Block } from '@skillsheet/db/blocks';
import { beforeAll, describe, expect, it } from 'vitest';

import PDF_FONT_FAMILY from './constants';
import { splitForHyphenation } from './fonts';
import { PrintSkillSheetDocument } from './print-document';
import { DEFAULT_QUALITY_OPTIONS, runQualityChecks, summarize, toSearchKey } from './print-quality';
import { extractQualityPages } from './print-quality-extract.node';
import { buildPrintViewModel } from './print-view-model';

const FONTS_DIR = path.resolve(process.cwd(), 'public', 'fonts');
const REGULAR_TTF = path.join(FONTS_DIR, 'NotoSansJP-Regular.ttf');
const BOLD_TTF = path.join(FONTS_DIR, 'NotoSansJP-Bold.ttf');

const REAL_BLOCKS_JSON = process.env.REAL_BLOCKS_JSON;
const OUT_PDF = process.env.PRINT_PDF_OUT;
const TITLE = 'エンジニアスキルシート';

describe('新しい印刷経路の品質', () => {
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
    '実データで 7 項目すべて緑になる',
    async () => {
      const blocks = JSON.parse(readFileSync(REAL_BLOCKS_JSON as string, 'utf-8')) as Block[];
      const vm = buildPrintViewModel(TITLE, blocks);
      const projects = vm.companies.flatMap((c) => c.projects);

      const headings = [
        TITLE,
        'スキル一覧',
        ...vm.companies.map((c) => c.name),
        ...projects.map((p) => p.title),
        // 簡約版の表が跨いだページは、fixed の列ヘッダーから始まる。
        '期間 案件 ／ 担当 チーム',
        // スキル一覧が 2 ページに跨ったときの継続ヘッダー。
        'スキル一覧（続き）',
        // 詳細版カードが跨いだページは継続ヘッダー（案件名）から始まる。
        ...projects.map((p) => `${p.title}（続き）`),
      ];
      const requiredTexts = projects.flatMap((p) =>
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
      );

      const buffer = await renderToBuffer(<PrintSkillSheetDocument title={TITLE} blocks={blocks} />);
      if (OUT_PDF) writeFileSync(OUT_PDF, buffer);

      const pages = await extractQualityPages(buffer);
      if (process.env.PRINT_TEXT_OUT) {
        writeFileSync(
          process.env.PRINT_TEXT_OUT,
          pages.map((items, i) => `=== page ${i + 1} ===\n${items.map((it) => it.text).join('')}`).join('\n\n'),
        );
      }
      const findings = runQualityChecks({ pages, headings, requiredTexts }, DEFAULT_QUALITY_OPTIONS);

      console.log(
        `[print] pages=${pages.length} 案件=${projects.length} findings=${findings.length} → ${summarize(findings)}`,
      );
      const byCheck = new Map<string, typeof findings>();
      for (const f of findings) byCheck.set(f.check, [...(byCheck.get(f.check) ?? []), f]);
      for (const [check, list] of byCheck) {
        console.log(`[print] --- ${check} (${list.length}) ---`);
        for (const f of list.slice(0, 20)) console.log(`[print] p${f.page} ${f.detail}`);
      }

      expect(findings).toEqual([]);
    },
    300_000,
  );
});
