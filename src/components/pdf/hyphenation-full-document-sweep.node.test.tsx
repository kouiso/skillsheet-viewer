/**
 * 全文字列フィールドを対象に、複数の列幅で実際に PDF 描画し、
 * ソースに存在しない ASCII ハイフン(U+002D)が本文中に何箇所出現するかを数える。
 *
 * ピンポイントの再現は hyphenation-ascii-boundary.node.test.tsx が担う。
 * こちらは「直したあとに文書全体でゼロになったか」を横断的に確認するための
 * スイープ専用テストで、実データ（本番 Neon の blocks テーブル）は個人情報のため
 * リポジトリへコミットできない。そのため既定では committed synthetic fixture
 * （`fixtures/print-quality-fixture.ts`）でこの横断チェックを回す（CI で常に実行される）。
 * 実データにも当てたいときは、blocks テーブルの JSON を書き出して `REAL_BLOCKS_JSON` に渡す
 * （追加の確認であり、CI 必須の経路ではない。print-quality.node.test.tsx と同じ運用）。
 *
 * @react-pdf/renderer の Font/renderToBuffer と pdfjs-dist への直接依存があるため、
 * CLAUDE.md の取り決めどおり *.node.test.tsx（vitest.config.pdf.ts / node 環境）に置く。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from '@react-pdf/renderer';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Block } from '@/db/blocks';

import PDF_FONT_FAMILY from './constants';
import { buildPdfQualityFixtureBlocks } from './fixtures/print-quality-fixture';
import { splitForHyphenation } from './fonts';
import { extractQualityPages } from './print-quality-extract.node';

const FONTS_DIR = path.resolve(process.cwd(), 'public', 'fonts');
const REGULAR_TTF = path.join(FONTS_DIR, 'NotoSansJP-Regular.ttf');
const BOLD_TTF = path.join(FONTS_DIR, 'NotoSansJP-Bold.ttf');
const REAL_BLOCKS_JSON = process.env.REAL_BLOCKS_JSON;

if (!REAL_BLOCKS_JSON) {
  // スキップではなく合成データへの切り替えだが、CI ログでどちらの経路を通ったかが
  // 埋もれないよう、ここで明示する（実データ経路は黙って通らないことがあるため）。
  console.warn(
    '[hyphenation-full-document-sweep.node.test.tsx] REAL_BLOCKS_JSON 未設定 — committed synthetic fixture で横断チェックする。' +
      '実データでも確認したい場合は REAL_BLOCKS_JSON に blocks テーブルの JSON パスを渡すこと。',
  );
}

/** 実データが渡されていればそれを、無ければ合成フィクスチャを返す。CI は常に後者を通る。 */
function loadBlocks(): Block[] {
  if (REAL_BLOCKS_JSON && existsSync(REAL_BLOCKS_JSON)) {
    return JSON.parse(readFileSync(REAL_BLOCKS_JSON, 'utf-8')) as Block[];
  }
  return buildPdfQualityFixtureBlocks();
}

/** JSON を再帰的に潜り、ある程度の長さを持つ文字列値だけを本文候補として集める。 */
function collectProseStrings(value: unknown, out: string[]): void {
  if (value == null) return;
  if (typeof value === 'string') {
    if (value.length >= 2) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectProseStrings(v, out);
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value)) collectProseStrings(v, out);
  }
}

function countChar(text: string, ch: string): number {
  return text.split(ch).length - 1;
}

const CANDIDATE_WIDTHS = [150, 220, 300, 400];

describe('全文書スイープ: ソースに無い "-" が出ない', () => {
  beforeAll(() => {
    if (!existsSync(REGULAR_TTF) || !existsSync(BOLD_TTF)) throw new Error(`fonts not found under ${FONTS_DIR}`);
    Font.register({
      family: PDF_FONT_FAMILY,
      fonts: [
        { src: REGULAR_TTF, fontWeight: 400 },
        { src: BOLD_TTF, fontWeight: 700 },
      ],
    });
    if (typeof Font.registerHyphenationCallback === 'function') {
      Font.registerHyphenationCallback(splitForHyphenation);
    }
  });

  it('全文字列を複数列幅で描画しても、ハイフン出現数がソース内の実ハイフン数を超えない', async () => {
    const raw = loadBlocks();
    const strings: string[] = [];
    collectProseStrings(raw, strings);
    const sourceText = strings.join('\n');
    const expectedHyphens = countChar(sourceText, '-');

    const styles = StyleSheet.create({
      text: { fontFamily: PDF_FONT_FAMILY, fontSize: 9, marginBottom: 4 },
    });

    const results: { width: number; observed: number; extra: number }[] = [];
    for (const width of CANDIDATE_WIDTHS) {
      const buffer = await renderToBuffer(
        <Document>
          <Page size="A4" style={{ padding: 20 }}>
            <View style={{ width }}>
              {strings.map((s, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 固定データのスイープ専用テスト
                <Text key={i} style={styles.text}>
                  {s}
                </Text>
              ))}
            </View>
          </Page>
        </Document>,
      );
      const pages = await extractQualityPages(buffer);
      const rendered = pages
        .flat()
        .map((item) => item.text)
        .join('');
      const observed = countChar(rendered, '-');
      results.push({ width, observed, extra: observed - expectedHyphens });
    }

    const totalExtra = results.reduce((sum, r) => sum + Math.max(0, r.extra), 0);
    console.log(
      `[hyphenation-sweep] source hyphens=${expectedHyphens} results=${JSON.stringify(results)} totalExtra=${totalExtra}`,
    );

    for (const r of results) {
      expect(r.extra, `width=${r.width}: observed=${r.observed} expected<=${expectedHyphens}`).toBeLessThanOrEqual(0);
    }
  }, 120_000);
});
