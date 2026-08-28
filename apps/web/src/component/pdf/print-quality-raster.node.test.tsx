/**
 * `print-quality-raster.node.ts` の回帰テスト。
 *
 * `DEFAULT_RASTER_OPTIONS.textPadding.bottom` は 3 → 10 に広げてある（p20 の閉じ切った
 * カードの角丸を「文字を伴わない図形」と誤検出しないため。ファイル冒頭コメント参照）。
 * この拡張が緩めすぎて本物の壊れ方（本文が別ページへ丸ごと逃げ、断片だけが版面の縁に
 * 独立して残る）まで見逃さないかを、手で組んだ孤立図形（本文から遠く離れた塗り・枠線の
 * 矩形）で確認する。これは `print-document.tsx` の実コンポーネントに依存しない、
 * 検出ロジックだけを狙った最小の PDF で行う。
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from '@react-pdf/renderer';
import { describe, expect, it } from 'vitest';

import PDF_FONT_FAMILY from './constants';
import { extractQualityPages } from './print-quality-extract.node';
import { DEFAULT_RASTER_OPTIONS, runRasterQualityChecks } from './print-quality-raster.node';

const FONTS_DIR = path.resolve(process.cwd(), 'public', 'fonts');
const REGULAR_TTF = path.join(FONTS_DIR, 'NotoSansJP-Regular.ttf');
const BOLD_TTF = path.join(FONTS_DIR, 'NotoSansJP-Bold.ttf');

const styles = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 46, paddingHorizontal: 40, fontFamily: PDF_FONT_FAMILY, fontSize: 11 },
  body: { fontSize: 11.5, lineHeight: 1.75 },
  // 孤立した「文字を伴わない図形」。本文の最後から遠く離れた版面下端近くに置く
  // （実測バグの再現: 塗りチップ 1 個・枠線チップ 2 個が本文と無関係に下端へ残った）。
  orphanFill: {
    position: 'absolute',
    top: 760,
    left: 112,
    width: 60,
    height: 16,
    backgroundColor: '#1F3A5F',
  },
  orphanOutline: {
    position: 'absolute',
    top: 760,
    left: 200,
    width: 60,
    height: 16,
    borderWidth: 1,
    borderColor: '#8A9099',
  },
});

function OrphanShapeProbeDocument() {
  const lines = Array.from({ length: 20 }, (_, i) => `本文${i + 1}行目。ここで終わり、続きは無い。`);
  return (
    <Document title="orphan probe">
      <Page size="A4" style={styles.page}>
        {lines.map((line) => (
          <Text key={line} style={styles.body}>
            {line}
          </Text>
        ))}
        <View style={styles.orphanFill} />
        <View style={styles.orphanOutline} />
      </Page>
    </Document>
  );
}

describe('print-quality-raster: textPadding.bottom を広げても本物の孤立図形は見逃さない', () => {
  it('本文から遠い塗り・枠線の矩形を bottom=3〜15 のどこでも edge-orphan-shape として検出する', async () => {
    if (!existsSync(REGULAR_TTF) || !existsSync(BOLD_TTF)) throw new Error(`fonts not found under ${FONTS_DIR}`);
    Font.register({
      family: PDF_FONT_FAMILY,
      fonts: [
        { src: REGULAR_TTF, fontWeight: 400 },
        { src: BOLD_TTF, fontWeight: 700 },
      ],
    });
    const buffer = await renderToBuffer(<OrphanShapeProbeDocument />);
    const pages = await extractQualityPages(buffer);

    // 3 は変更前の値、10 は変更後の既定値。その間と少し上まで振って安全マージンを見る。
    for (const bottom of [3, 6, 8, 10, 12, 15]) {
      const opts = { ...DEFAULT_RASTER_OPTIONS, textPadding: { ...DEFAULT_RASTER_OPTIONS.textPadding, bottom } };
      const findings = await runRasterQualityChecks(buffer, pages, opts);
      const orphanFindings = findings.filter((f) => f.check === 'edge-orphan-shape');
      expect(orphanFindings.length, `bottom=${bottom} で孤立図形を検出できていない`).toBeGreaterThan(0);
    }
  }, 60_000);
});
