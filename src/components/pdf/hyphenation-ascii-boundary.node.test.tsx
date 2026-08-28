/**
 * 実データで再現した defect: ASCII の連なり（例: "OpenNext"）の直後に、行頭禁則で
 * 改行が禁じられている全角記号（）、、。・ など）が続くとき、splitForHyphenation() は
 * 意図どおり BREAK_MARKER を挟まない（禁則を守る）が、@react-pdf/textkit 側の
 * getNodes() はそのASCII シラブルの「次シラブルが空白でない」ことだけを見て
 * hyphenated: true を立て、そこにペナルティノード（ハイフン付き改行候補）を作って
 * しまう。狭い列幅でこの位置が実際の改行点に選ばれると、ソースに存在しない
 * U+002D が本文中（禁則対象の文字の直前）に出力される。
 *
 * 実測（Issue 報告）: 「…へのエッジデプロイ、-アクセス解析はGA4を…」のように、
 * 句読点の直前にハイフンが混入した。
 *
 * @react-pdf/renderer の Font/renderToBuffer と pdfjs-dist への直接依存があるため、
 * CLAUDE.md の取り決めどおり *.node.test.tsx（vitest.config.pdf.ts / node 環境）に置く。
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Document, Font, Page, renderToBuffer, StyleSheet, Text } from '@react-pdf/renderer';
import { beforeAll, describe, expect, it } from 'vitest';

import PDF_FONT_FAMILY from './constants';
import { splitForHyphenation } from './fonts';
import { extractQualityPages } from './print-quality-extract.node';

const FONTS_DIR = path.resolve(process.cwd(), 'public', 'fonts');
const REGULAR_TTF = path.join(FONTS_DIR, 'NotoSansJP-Regular.ttf');
const BOLD_TTF = path.join(FONTS_DIR, 'NotoSansJP-Bold.ttf');

// 実データ（コンテンツメディアの開発 / comment）から採った、defect を含む実際の一文。
// "Workers（OpenNext）" の ASCII → 全角括弧の境界と、句読点直前の境界を複数含む。
const REAL_PHRASE =
  'ホスティングは Cloudflare Workers（OpenNext）へのエッジデプロイ、アクセス解析は GA4 を BigQuery 経由で取り込み、PV ランキングの元データにしています。';

// 実際のカード列幅は可変（flex）なので、defect が起こりうる代表的な列幅帯をスイープして
// 「特定のマジックナンバー幅でしか再現しない」フラフラなテストにしない。
const CANDIDATE_WIDTHS = [110, 130, 150, 170, 190, 210, 230, 260, 290, 320, 360, 400, 450];

async function renderPhraseAt(width: number, text: string): Promise<string> {
  const styles = StyleSheet.create({
    text: { fontFamily: PDF_FONT_FAMILY, fontSize: 9, width },
  });
  const buffer = await renderToBuffer(
    <Document>
      <Page size="A4">
        <Text style={styles.text}>{text}</Text>
      </Page>
    </Document>,
  );
  const pages = await extractQualityPages(buffer);
  return pages
    .flat()
    .map((item) => item.text)
    .join('');
}

/** 抽出テキストに、元の文には無い ASCII ハイフン(U+002D)が混入していないか。 */
function findStrayHyphens(source: string, rendered: string): string[] {
  if (!rendered.includes('-')) return [];
  if (source.includes('-')) {
    // ソース自体にハイフンがある語（今回のフレーズには無いが将来のフレーズ用に念のため）は
    // 出現数の増加でのみ判定する。
    const extra = rendered.split('-').length - source.split('-').length;
    return extra > 0 ? [`stray hyphen count += ${extra}`] : [];
  }
  // ソースに一切ハイフンが無いのに抽出テキストに現れたら、混入位置の前後文脈を返す。
  const hits: string[] = [];
  let from = 0;
  for (;;) {
    const idx = rendered.indexOf('-', from);
    if (idx === -1) break;
    hits.push(rendered.slice(Math.max(0, idx - 10), idx + 11));
    from = idx + 1;
  }
  return hits;
}

describe('ASCII 語 → 行頭禁則文字の境界でハイフンが混入しない', () => {
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

  it('複数の列幅で改行させても、ソースに存在しない "-" が本文に出ない', async () => {
    const allHits: { width: number; hits: string[] }[] = [];
    for (const width of CANDIDATE_WIDTHS) {
      const rendered = await renderPhraseAt(width, REAL_PHRASE);
      const hits = findStrayHyphens(REAL_PHRASE, rendered);
      if (hits.length > 0) allHits.push({ width, hits });
    }
    if (allHits.length > 0) {
      console.error('stray hyphen reproduced at widths:', JSON.stringify(allHits, null, 2));
    }
    expect(allHits).toEqual([]);
  });
});
