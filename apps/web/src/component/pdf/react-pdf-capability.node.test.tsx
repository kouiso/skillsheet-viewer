/**
 * 印刷デザイン実装が前提にする @react-pdf/renderer の挙動を、実バイト描画で固定する。
 *
 * ここに並ぶのは全部「型と公開ドキュメントからは分からず、実測で判明した」もの。
 * どれも壊れ方が「エラーを出さずに描画が空になる」なので、実装側のテストでは検出できない。
 * ライブラリ更新で前提が変わったらここが落ちるようにしておく。
 *
 * 実測（@react-pdf/renderer 4.5.1 / 同梱 @react-pdf/layout 4.6.1）:
 *
 * A. `Text` に明示的な `height` を与えると、その Text は描画されない（静的でも動的でも）。
 * B. `render` prop を持つ `Text` は、`lineHeight` を指定すると描画されない。
 *    （`resolveDynamicNodes` が動的 Text の box.height を 0 に戻して再計算する経路と、
 *     ピン留めされた行高が噛み合わない。）
 * C. A と B の合わせ技で、**現行の `styles.footer`（absolute + height:12 + lineHeight:1 +
 *    render）はページ番号を 1 ページも描画していなかった**。「height を与えないと box 高さが
 *    ページ毎に発散する」というコメントに従って足した height が、フッターごと消していた。
 * D. 安全な形は `View` + `fixed` + `position:'absolute'`（**height を与えない**）+ `render` で、
 *    中で `Text` を返す。この形なら全ページで呼ばれ、`pageNumber` / `totalPages` /
 *    `subPageNumber`（Page 単位の相対番号）が正しく渡り、内側の Text には lineHeight を効かせられる。
 * E. `render` は 1 ページにつき 2 回呼ばれる。1 回目はページ分割中で `subPageNumber` を持たず、
 *    レイアウト次第で「まだそのページに無いカード」に対しても呼ばれる。確定パスは
 *    `subPageNumber` を持つので、これで見分ける。
 * F. カードの中に置いた `fixed` は、そのカードが占める全ページに出る。
 *    ページ跨ぎの継続ヘッダーはこれで作る。
 * G. `gap` は横並びの間隔として実際に効く（`marginRight` での代替は不要）。
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from '@react-pdf/renderer';
import { getDocument } from 'pdfjs-dist';
import { beforeAll, describe, expect, it } from 'vitest';

import PDF_FONT_FAMILY from './constants';

const FONTS_DIR = path.resolve(process.cwd(), 'public', 'fonts');
const REGULAR_TTF = path.join(FONTS_DIR, 'NotoSansJP-Regular.ttf');
const BOLD_TTF = path.join(FONTS_DIR, 'NotoSansJP-Bold.ttf');

const GAP = 12;
const CELL = 20;
// A4 の本文高さ（842 - 42 - 40 = 760pt）に対し 11pt × 行間 1.75 ≒ 19pt。
// 55 行あれば 1 枚のカードが必ず 1 ページに収まらない。
const CARD_LINES = 55;

const styles = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 80, paddingHorizontal: 40, fontFamily: PDF_FONT_FAMILY, fontSize: 11 },
  line: { fontSize: 11, lineHeight: 1 },
  card: { marginBottom: 16 },
  gapRow: { flexDirection: 'row', gap: GAP },
  cell: { width: CELL },
  // A の検証: height の有無だけが違う 2 つの絶対配置
  absPlain: { position: 'absolute', bottom: 10, left: 40 },
  absHeight: { position: 'absolute', bottom: 24, left: 40, height: 12 },
  // B の検証: render 付き Text に lineHeight を与えたもの
  dynLineHeight: { lineHeight: 1 },
  // D の安全な形
  safeHeader: { position: 'absolute', top: 16, left: 40, right: 40 },
});

type RenderProps = { pageNumber: number; totalPages: number; subPageNumber?: number; subPageTotalPages?: number };
type Dynamic = React.ComponentType<{
  fixed?: boolean;
  style?: unknown;
  render: (props: RenderProps) => React.ReactNode;
}>;
// render prop は公開型に無い（実装が node.props を直接読む）。ここだけ型を緩める。
// biome-ignore lint/suspicious/noExplicitAny: 公開型に render が無いため
const DynamicView = View as any as Dynamic;
// biome-ignore lint/suspicious/noExplicitAny: 公開型に render が無いため
const DynamicText = Text as any as Dynamic;

const cardLines = (tag: string) =>
  Array.from({ length: CARD_LINES }, (_, i) => `${tag}本文${i + 1}。日本語のテキストで高さを稼ぐ。`);

// F / E の検証用に、カードごとの render 呼び出しを記録する。
const renderCalls: string[] = [];

function Card({ tag }: { tag: string }) {
  return (
    <View style={styles.card}>
      <DynamicView
        fixed
        render={({ pageNumber, subPageNumber }) => {
          renderCalls.push(`${tag}:p${pageNumber}:sub${subPageNumber ?? 'none'}`);
          return <Text style={styles.line}>{`CONT-${tag}`}</Text>;
        }}
      />
      {cardLines(tag).map((line) => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function Probe() {
  return (
    <Document title="capability probe">
      <Page size="A4" style={styles.page}>
        <Text style={styles.absPlain}>ABS-PLAIN</Text>
        <Text style={styles.absHeight}>ABS-HEIGHT</Text>
        <DynamicText render={() => 'DYN-TEXT-NOSTYLE'} />
        <DynamicText style={styles.dynLineHeight} render={() => 'DYN-TEXT-LINEHEIGHT'} />
        <DynamicView
          fixed
          style={styles.safeHeader}
          render={({ pageNumber, totalPages, subPageNumber, subPageTotalPages }) => (
            <Text style={styles.line}>
              {`HEAD-${pageNumber}of${totalPages}-sub${subPageNumber}of${subPageTotalPages}`}
            </Text>
          )}
        />
        <View style={styles.gapRow}>
          <View style={styles.cell}>
            <Text style={styles.line}>A</Text>
          </View>
          <View style={styles.cell}>
            <Text style={styles.line}>B</Text>
          </View>
          <View style={styles.cell}>
            <Text style={styles.line}>C</Text>
          </View>
        </View>
        <Card tag="X" />
        <Card tag="Y" />
      </Page>
    </Document>
  );
}

interface Item {
  str: string;
  x: number;
  y: number;
}

async function extract(buffer: Buffer): Promise<Item[][]> {
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: Item[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    const items: Item[] = [];
    for (const raw of content.items) {
      if (!('str' in raw) || typeof raw.str !== 'string' || raw.str.trim() === '') continue;
      const transform = raw.transform as number[];
      items.push({ str: raw.str, x: transform[4], y: transform[5] });
    }
    pages.push(items);
  }
  return pages;
}

describe('@react-pdf/renderer の前提挙動', () => {
  let pages: Item[][];
  const found = (needle: string) => pages.flat().filter((it) => it.str.startsWith(needle));

  beforeAll(async () => {
    if (!existsSync(REGULAR_TTF) || !existsSync(BOLD_TTF)) throw new Error(`fonts not found under ${FONTS_DIR}`);
    Font.register({
      family: PDF_FONT_FAMILY,
      fonts: [
        { src: REGULAR_TTF, fontWeight: 400 },
        { src: BOLD_TTF, fontWeight: 700 },
      ],
    });
    pages = await extract(await renderToBuffer(<Probe />));
  }, 180_000);

  it('A: Text に明示的な height を与えると描画が消える', () => {
    expect(found('ABS-PLAIN')).toHaveLength(1);
    expect(found('ABS-HEIGHT')).toHaveLength(0);
  });

  it('B: render 付き Text は lineHeight を指定すると描画が消える', () => {
    expect(found('DYN-TEXT-NOSTYLE')).toHaveLength(1);
    expect(found('DYN-TEXT-LINEHEIGHT')).toHaveLength(0);
  });

  it('D: View + fixed + absolute(height なし) + render は全ページでページ番号を描画できる', () => {
    const heads = pages.map((items) => items.find((it) => it.str.startsWith('HEAD-'))?.str ?? '');
    expect(heads.every((h) => h !== '')).toBe(true);
    // Page が 1 つだけなので、通しページ番号と Page 相対番号は一致する。
    for (const [i, head] of heads.entries()) {
      expect(head).toBe(`HEAD-${i + 1}of${pages.length}-sub${i + 1}of${pages.length}`);
    }
  });

  it('E: render は分割中と確定描画で 2 回呼ばれ、subPageNumber の有無で確定パスを見分けられる', () => {
    const provisional = renderCalls.filter((c) => c.endsWith(':subnone'));
    const settled = renderCalls.filter((c) => !c.endsWith(':subnone'));
    expect(provisional.length).toBeGreaterThan(0);
    expect(settled.length).toBeGreaterThan(0);
    // 確定パスは必ず subPageNumber を持つ。カードの開始ページを覚える実装は、
    // これを持たない呼び出しを除外しないと開始ページを取り違える。
    expect(settled.every((c) => /:sub\d+$/.test(c))).toBe(true);
  });

  it('F: カード内の fixed は、そのカードが占める全ページに出る（見出し無しページを作らない）', () => {
    // ページごとに「本文が乗っているカード」と「継続ヘッダーが出ているカード」を集める。
    const perPage = pages.map((items) => {
      const bodies = new Set<string>();
      const heads = new Set<string>();
      for (const item of items) {
        const body = item.str.match(/^([XY])本文/);
        if (body) bodies.add(body[1]);
        const head = item.str.match(/^CONT-([XY])$/);
        if (head) heads.add(head[1]);
      }
      return { bodies, heads };
    });

    // 本文が乗っているページには、必ずそのカードの継続ヘッダーが出ている。
    for (const { bodies, heads } of perPage) {
      for (const tag of bodies) expect(heads.has(tag)).toBe(true);
    }
    // 少なくとも 1 枚のカードは 2 ページ以上に跨り、その全ページに出ている。
    const spanPerCard = new Map<string, number>();
    for (const { heads } of perPage) {
      for (const tag of heads) spanPerCard.set(tag, (spanPerCard.get(tag) ?? 0) + 1);
    }
    expect(Math.max(...spanPerCard.values())).toBeGreaterThanOrEqual(2);
  });

  it('G: gap が横並びの間隔として実際に効く', () => {
    const first = pages[0];
    const a = first.find((it) => it.str === 'A');
    const b = first.find((it) => it.str === 'B');
    const c = first.find((it) => it.str === 'C');
    expect(a && b && c).toBeTruthy();
    if (!a || !b || !c) return;
    expect(Math.round(b.x - a.x)).toBe(CELL + GAP);
    expect(Math.round(c.x - b.x)).toBe(CELL + GAP);
  });
});
