// このファイルは vitest.config.pdf.ts（environment: 'node'）側で走る。
// jsdom では renderToBuffer するとフォントサブセットがバイトレベルで壊れるため、
// 描画に関する主張は **決して jsdom 側の *.test.tsx に書かないこと。**
//
// Issue #262 / #263 で実機再現した PDF の欠陥 A〜G の回帰防止。
// いずれも「実際に renderToBuffer した PDF を読み直して」検証する。

import path from 'node:path';

import { Font, renderToBuffer } from '@react-pdf/renderer';
import { type ProjectBlockData, projectBlockToMarkdown } from '@skillsheet/db';
import { getDocument } from 'pdfjs-dist';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { beforeAll, describe, expect, it } from 'vitest';

import { PDF_REMARK_PLUGINS } from '@/lib/markdown-config';

import PDF_FONT_FAMILY from './constants';
import { splitForHyphenation } from './fonts';
import { MISSING_GLYPH_PLACEHOLDER } from './glyph-coverage';
import { CONTENT_HEIGHT, CONTENT_WIDTH, estimateBlocksHeight, FONT_SIZE, PAGE } from './layout-metrics';
import { type MdNode, nodeText } from './mdast';
import { SkillSheetDocument } from './skill-sheet-document';

const FONTS_DIR = path.resolve(process.cwd(), 'public', 'fonts');
const REGULAR_TTF = path.join(FONTS_DIR, 'NotoSansJP-Regular.ttf');
const BOLD_TTF = path.join(FONTS_DIR, 'NotoSansJP-Bold.ttf');
const RENDER_TIMEOUT_MS = 120_000;

function registerNodeFonts(): void {
  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: REGULAR_TTF, fontWeight: 400 },
      { src: BOLD_TTF, fontWeight: 700 },
      { src: REGULAR_TTF, fontWeight: 400, fontStyle: 'italic' },
      { src: BOLD_TTF, fontWeight: 700, fontStyle: 'italic' },
    ],
  });
  // 本番（pdf/fonts.ts）はブラウザ向け URL でフォントを登録するので Node からは
  // 再利用できないが、折り返し用の hyphenationCallback はフォントパスと無関係なので
  // 同じ実装を登録する。これが無いと C/F の回帰テストが本番の改行ロジックを見ない。
  if (typeof Font.registerHyphenationCallback === 'function') {
    Font.registerHyphenationCallback(splitForHyphenation);
  }
}

interface PdfTextItem {
  str: string;
  /** テキスト空間での送り幅（pt）。 */
  width: number;
  /** 行の高さ（pt）。実効フォントサイズの目安として使う。 */
  height: number;
  /** [a, b, c, d, e, f]。e = x, f = y（PDF 座標系・左下原点）。 */
  transform: number[];
}

interface PdfPage {
  text: string;
  items: PdfTextItem[];
}

async function readPdf(buffer: Buffer): Promise<PdfPage[]> {
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: PdfPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    let text = '';
    for (const item of content.items) {
      if (!('str' in item) || typeof item.str !== 'string') continue;
      text += item.str;
      items.push(item as unknown as PdfTextItem);
    }
    pages.push({ text, items });
  }
  return pages;
}

// splitForHyphenation は改行機会を独立したテキストアイテムとして残すため、pdf.js の
// 抽出結果ではアイテム間に空白が入ることがある（PDF 上に空白グリフがあるわけではない）。
// 欠落の検証では本質的でないので、比較前に空白を落とす。
function normalize(text: string): string {
  return text.replace(/\s+/g, '');
}

function parseMarkdown(content: string): MdNode[] {
  const processor = unified().use(remarkParse).use(PDF_REMARK_PLUGINS);
  const tree = processor.runSync(processor.parse(content)) as unknown as MdNode;
  return tree.children ?? [];
}

// 「画面に出るテキスト」の代用として、ビューアと同じ remark パイプラインで解析した
// mdast から、描画される最小単位（段落・見出し・リスト項目・セル）のテキストを集める。
// PDF 側は 1 本の文字列に潰して部分一致で照合するため、単位ごとに分けておかないと
// 「途中の 1 段落だけ落ちた」を検出できない。
function visibleTextUnits(nodes: MdNode[]): string[] {
  const units: string[] = [];
  const walk = (node: MdNode): void => {
    switch (node.type) {
      case 'heading':
      case 'paragraph': {
        const text = normalize(nodeText(node));
        if (text) units.push(text);
        return;
      }
      case 'list':
        for (const item of node.children ?? []) for (const child of item.children ?? []) walk(child);
        return;
      case 'table':
        for (const row of node.children ?? []) {
          for (const cell of row.children ?? []) {
            const text = normalize(nodeText(cell));
            if (text) units.push(text);
          }
        }
        return;
      case 'code': {
        const text = normalize(node.value ?? '');
        if (text) units.push(text);
        return;
      }
      default:
        for (const child of node.children ?? []) walk(child);
    }
  };
  for (const node of nodes) walk(node);
  return units;
}

// ページ番号フッタ（bottom:18 の位置に描く固定要素）。印字領域の判定から除外する。
function isPageNumber(text: string): boolean {
  return /^\d+\s*\/\s*\d+$/.test(text.trim());
}

// 同一ページ内で、隣り合うベースラインの間隔がフォントサイズを下回っている箇所。
// 1ページより高い分割不可ノードを押し込まれると yoga が行を潰し、ここが 1 未満になる
// （実測: 旧実装 0.014 = ほぼ完全な重ね描き / 新実装 1.600 = 行送りそのもの）。
function overlappingBaselines(pages: PdfPage[]): string[] {
  const found: string[] = [];
  pages.forEach((page, index) => {
    const tallestByBaseline = new Map<number, number>();
    for (const item of page.items) {
      if (!item.str.trim()) continue;
      const baseline = Math.round(item.transform[5] * 100) / 100;
      tallestByBaseline.set(baseline, Math.max(tallestByBaseline.get(baseline) ?? 0, item.height));
    }
    const baselines = [...tallestByBaseline.keys()].sort((a, b) => b - a);
    for (let i = 1; i < baselines.length; i++) {
      const gap = baselines[i - 1] - baselines[i];
      const fontSize = Math.min(tallestByBaseline.get(baselines[i - 1]) ?? 0, tallestByBaseline.get(baselines[i]) ?? 0);
      if (fontSize > 0 && gap < fontSize) {
        found.push(`page${index + 1}: gap=${gap.toFixed(2)} < fontSize=${fontSize}`);
      }
    }
  });
  return found;
}

// 印字領域（ページ余白の内側）から出ているテキスト。フッタだけは余白の下に置く設計なので除く。
function outsidePrintableArea(pages: PdfPage[]): string[] {
  const bottom = PAGE.PADDING_BOTTOM;
  const top = PAGE.HEIGHT - PAGE.PADDING_TOP;
  const found: string[] = [];
  pages.forEach((page, index) => {
    for (const item of page.items) {
      if (!item.str.trim() || isPageNumber(item.str)) continue;
      const y = item.transform[5];
      if (y < bottom || y + item.height > top) found.push(`page${index + 1}: ${item.str}@${y.toFixed(1)}`);
    }
  });
  return found;
}

// 実データのデモシートに近い形（会社概要文・業務内容・習得スキル・実績・案件コメント）で
// 案件を作る。comment は「長い日本語の本文 + 短い段落の並び」にしてある。旧実装は
// カード全体の合計文字数（1400 文字）で分割不可を決めていたため、短い段落が並ぶ形は
// 閾値をすり抜けて実高さが 1 ページを超え、本文が丸ごと PDF から消えていた（Issue #262）。
function buildDemoProjects(count: number): ProjectBlockData {
  const companies = Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    name: `株式会社サンプル${i + 1}`,
    kind: 'SES・受託開発',
    period: '2020-04〜2021-03',
    note: `株式会社サンプル${i + 1}は業務システムの受託開発を主とする企業で、私は開発チームの一員として参画しました。`,
  }));
  const items = Array.from({ length: count }, (_, i) => {
    const no = i + 1;
    // 実データの案件コメントは「見出し的な太字ラベル + 数行の説明」を何本も並べた形になる。
    // 旧実装の閾値（合計 1400 文字）はこの形を「1ページに収まる」と誤判定し、1ページより
    // 高いカードを分割不可のまま押し込んで、表と本文が重なり合った潰れた PDF を出していた。
    const sections = Array.from(
      { length: 18 },
      (_, k) => `**観点${k}**\n\n案件${no}補足${k}では設計方針を整理しました。`,
    ).join('\n\n');
    return {
      id: `p${i}`,
      companyId: `c${i}`,
      title: `大規模業務システムのリプレイス案件${no}`,
      scope: 'バックエンド / フロントエンド',
      period: '2020-04〜2021-03',
      role: 'テックリード',
      team: '12 名',
      tech: {
        lang: ['TypeScript', 'Go'],
        fw: ['React', 'Next.js'],
        db: ['PostgreSQL'],
        infra: ['AWS'],
        tools: ['GitHub Actions'],
        collab: ['Slack'],
      },
      process: ['要件定義', '基本設計', '詳細設計', '実装', 'テスト'],
      duties: '既存システムの調査と移行計画の立案、API 設計および実装、CI/CD パイプラインの整備を担当しました。',
      acquired: '大規模リプレイスの進行管理とパフォーマンスチューニングの知見を得ました。',
      comment: [
        `案件${no}説明文の開始。本案件では、レガシーな基幹システムを段階的にモダンな構成へ移行する取り組みを主導しました。既存の仕様書が失われていたため、稼働中のコードとデータベースの実データから業務ロジックを逆算し、関係部署へのヒアリングを重ねて仕様を再定義するところから着手しています。`,
        `業務を止めないことが最優先要件であったため、ストラングラーパターンを採用して新旧システムを並行稼働させ、機能単位で少しずつ切り替える方針を取りました。案件${no}説明文の終了。`,
        sections,
      ].join('\n\n'),
    };
  });
  return { companies, items };
}

// ---------------------------------------------------------------------------

describe('PDF 欠陥 A〜G の回帰防止（Issue #262 / #263）', () => {
  beforeAll(() => {
    registerNodeFonts();
  });

  // A: 実データ相当（案件12件・日本語の長い説明文つき）で、画面に出るテキストが
  // 1 単位も欠けずに PDF のテキスト層へ載ること。
  it(
    'A: 案件12件の説明文を含む全テキストが PDF から 1 つも欠落しない（Issue #262）',
    async () => {
      const markdown = projectBlockToMarkdown(buildDemoProjects(12));
      const units = visibleTextUnits(parseMarkdown(markdown));
      // 照合対象がゼロ件では素通りしてしまうので、まず単位が集まっていることを確かめる。
      expect(units.length).toBeGreaterThan(100);

      const buffer = await renderToBuffer(<SkillSheetDocument title="デモ スキルシート" content={markdown} />);
      const pages = await readPdf(buffer);
      const rendered = normalize(pages.map((page) => page.text).join(''));

      const missing = units.filter((unit) => !rendered.includes(unit));
      expect(missing).toEqual([]);

      // テキスト層に載っているだけでは足りない。1ページより高い分割不可カードを
      // 押し込まれると、@react-pdf は行を潰して重ね描きするため、抽出はできるのに
      // 紙面では読めない（Issue #262 の実際の見え方）。行が重なっていないこと、
      // 印字領域からはみ出していないことを幾何で押さえる。
      expect(overlappingBaselines(pages)).toEqual([]);
      expect(outsidePrintableArea(pages)).toEqual([]);

      // 説明文（comment）が本当に載っているかを、案件ごとの一意なマーカーでも押さえる。
      for (let no = 1; no <= 12; no++) {
        expect(rendered).toContain(`案件${no}説明文の開始`);
        expect(rendered).toContain(`案件${no}説明文の終了`);
        expect(rendered).toContain(`案件${no}補足17`);
      }
    },
    RENDER_TIMEOUT_MS,
  );

  // A の最小形。分割不可（wrap={false}）のカードが 1 ページより高いと、
  // @react-pdf/layout はそのカードを現在ページへ押し込み、はみ出した子要素を落とす。
  it(
    'A: 短い段落が大量に並ぶ案件カードでも全段落が PDF に残る（Issue #262 の最小再現）',
    async () => {
      const paragraphCount = 150;
      const markdown = [
        '### 株式会社テスト — 短い段落多数案件',
        '',
        '| 項目 | 内容 |',
        '| :--- | :--- |',
        '| 期間 | 2020-04〜2021-03 |',
        '',
        Array.from({ length: paragraphCount }, (_, i) => `段落${i}マーカー`).join('\n\n'),
        '',
      ].join('\n');

      const buffer = await renderToBuffer(<SkillSheetDocument title="短い段落" content={markdown} />);
      const pages = await readPdf(buffer);
      const rendered = normalize(pages.map((page) => page.text).join(''));

      const missing = Array.from({ length: paragraphCount }, (_, i) => `段落${i}マーカー`).filter(
        (marker) => !rendered.includes(marker),
      );
      expect(missing).toEqual([]);
      // 1 ページに押し込まれていない＝ちゃんと複数ページへ分割されていること。
      expect(pages.length).toBeGreaterThan(1);
    },
    RENDER_TIMEOUT_MS,
  );

  // B: fixed + render のフッタが全ページに描画されること。
  // 旧実装は footer に height を与えており、最終 PDF に一度も出力されなかった。
  it(
    'B: ページ番号フッタが全ページに描画される（Issue #263 B）',
    async () => {
      const markdown = Array.from({ length: 120 }, (_, i) => `本文${i}行目です。`).join('\n\n');
      const buffer = await renderToBuffer(<SkillSheetDocument title="フッタ" content={markdown} />);
      const pages = await readPdf(buffer);
      expect(pages.length).toBeGreaterThan(2);

      pages.forEach((page, index) => {
        expect(normalize(page.text)).toContain(`${index + 1}/${pages.length}`);
      });
    },
    RENDER_TIMEOUT_MS,
  );

  // C: 空白を含まない長いトークン（技術名の連結・長い URL）が表セルで切り捨てられないこと。
  it(
    'C: 表セルの長い未分割トークンがクリップされない（Issue #263 C）',
    async () => {
      const tech = 'TypeScriptJavaScriptPythonRustGoElixirKotlinSwiftTailwindCSSReactNativeGoRustElixir';
      const url = 'https://example.com/very/long/path/that/never/ends/and/keeps/going/forever/abcdefghijklmnop';
      const markdown = [
        '## 表セルのクリップ',
        '',
        '| 項目 | 内容 |',
        '| :--- | :--- |',
        `| 技術スタック | ${tech} |`,
        `| URL | ${url} |`,
        // ラベル列（もっとも狭い列）に長いトークンが来るケースも押さえる。
        `| ${tech} | 短い内容 |`,
        '',
      ].join('\n');

      const buffer = await renderToBuffer(<SkillSheetDocument title="セル" content={markdown} />);
      const pages = await readPdf(buffer);
      const rendered = normalize(pages.map((page) => page.text).join(''));

      expect(rendered).toContain(tech);
      expect(rendered).toContain(url);
      // 折り返しのために人工的なハイフンが混ざっていないこと（Issue #171 の作法を踏襲）。
      expect(rendered).not.toContain('Elixir-');
      expect(rendered).not.toContain('forever-');
    },
    RENDER_TIMEOUT_MS,
  );

  // D: 通常の `##` 見出しが本文と切り離されてページ末尾に取り残されないこと。
  // 旧実装は案件見出し（■接頭辞）のときだけ minPresenceAhead を設定していたため、
  // 「見出しは入るが本文は入らない」だけの余白がページ末に残ると見出しだけが取り残された。
  // その余白量はページ幾何とフォントサイズで決まるので、詰め物の行数を 1 行ずつ動かして
  // 全ての残余パターンを走査する（どこか 1 つでも孤立したら落ちる）。
  it(
    'D: 通常見出しが本文と別ページに孤立しない（Issue #263 D）',
    async () => {
      const orphans: number[] = [];
      // 1 ページに入る 1 行段落の数より少し多めまで動かせば、ページ末の残余は一巡する。
      const maxFiller = Math.ceil(CONTENT_HEIGHT / (FONT_SIZE.BODY * 1.6)) + 2;
      for (let filler = 1; filler <= maxFiller; filler++) {
        const markdown = [
          ...Array.from({ length: filler }, (_, i) => `詰め物${i}行目。\n`),
          '## 孤立検査の見出し',
          '',
          '孤立検査の本文。',
          '',
        ].join('\n');
        const pages = await readPdf(await renderToBuffer(<SkillSheetDocument title="孤立" content={markdown} />));
        const normalized = pages.map((page) => normalize(page.text));
        const headingPage = normalized.findIndex((page) => page.includes('孤立検査の見出し'));
        const bodyPage = normalized.findIndex((page) => page.includes('孤立検査の本文'));
        expect(headingPage).toBeGreaterThanOrEqual(0);
        expect(bodyPage).toBeGreaterThanOrEqual(0);
        if (headingPage !== bodyPage) orphans.push(filler);
      }
      expect(orphans).toEqual([]);
    },
    RENDER_TIMEOUT_MS,
  );

  // E: フォントが字形を持たない文字が、無関係なグリフとして（しかも送り幅 0 で
  // 隣の文字に重なって）描かれないこと。
  it(
    'E: 絵文字・補助面の文字は代替表記になり、前後の本文を壊さない（Issue #263 E）',
    async () => {
      const markdown = '絵文字は🚀🎉✅で、補助面は𠀀𠀁𪚲です。BMP未収録は⚡✔☑です。\n';
      const buffer = await renderToBuffer(<SkillSheetDocument title="グリフ" content={markdown} />);
      const pages = await readPdf(buffer);
      const rendered = normalize(pages.map((page) => page.text).join(''));

      const geta = MISSING_GLYPH_PLACEHOLDER;
      expect(rendered).toContain(`絵文字は${geta.repeat(3)}で、補助面は${geta.repeat(3)}です。`);
      expect(rendered).toContain(`BMP未収録は${geta.repeat(3)}です。`);
      // 未収録文字は 1 文字も PDF に残っていないこと。
      for (const ch of ['🚀', '🎉', '✅', '𠀀', '𠀁', '𪚲', '⚡', '✔', '☑']) {
        expect(rendered).not.toContain(ch);
      }
    },
    RENDER_TIMEOUT_MS,
  );

  // F: 段落中の長い URL が右マージンからはみ出さないこと（テキストは残るが印刷が崩れる）。
  it(
    'F: 段落中の長い URL が右マージンを越えない（Issue #263 F）',
    async () => {
      const url =
        'https://example.com/very/long/path/that/never/ends/and/keeps/going/forever/abcdefghijklmnopqrstuvwxyz0123456789';
      const markdown = `段落中の長いURL: ${url} です。\n\n連結識別子: SomeVeryLongIdentifierNameWithoutAnySpacesAtAllForTesting です。\n`;
      const buffer = await renderToBuffer(<SkillSheetDocument title="マージン" content={markdown} />);
      const pages = await readPdf(buffer);

      const rightEdge = PAGE.WIDTH - PAGE.PADDING_HORIZONTAL;
      // 行末の丸め・字形のオーバーハングを吸収する許容量。
      const tolerance = 1;
      const overflowing = pages.flatMap((page) =>
        page.items
          .map((item) => ({ str: item.str, right: item.transform[4] + item.width }))
          .filter((item) => item.str.trim().length > 0 && item.right > rightEdge + tolerance),
      );
      expect(overflowing).toEqual([]);
      // はみ出しを消すために本文が落ちていないこと。
      expect(normalize(pages.map((page) => page.text).join(''))).toContain(url);
    },
    RENDER_TIMEOUT_MS,
  );

  // G: 本文が 10.5pt で描かれていること（旧 9.5pt は小さすぎた）。
  it(
    'G: 本文が 10.5pt 以上で描画され、見出し・表・フッタとの大小関係が保たれる（Issue #263 G）',
    async () => {
      expect(FONT_SIZE.BODY).toBeGreaterThanOrEqual(10.5);
      // 見出しは本文より大きく、表セル・コード・フッタは本文以下（ただし小さすぎない）。
      expect(FONT_SIZE.H4).toBeGreaterThan(FONT_SIZE.BODY);
      expect(FONT_SIZE.H3).toBeGreaterThan(FONT_SIZE.H4);
      expect(FONT_SIZE.H2).toBeGreaterThan(FONT_SIZE.H3);
      expect(FONT_SIZE.H1).toBeGreaterThan(FONT_SIZE.H2);
      expect(FONT_SIZE.TITLE).toBeGreaterThan(FONT_SIZE.H1);
      expect(FONT_SIZE.CELL).toBeLessThanOrEqual(FONT_SIZE.BODY);
      expect(FONT_SIZE.CELL).toBeGreaterThanOrEqual(10);
      expect(FONT_SIZE.CODE).toBeGreaterThanOrEqual(9.5);
      expect(FONT_SIZE.FOOTER).toBeGreaterThanOrEqual(9);

      // CJK は改行機会ごとにテキストアイテムが分かれるため、サイズの実測には
      // 分割されないラテン文字の目印を使う。
      const markdown = 'BodySizeProbe\n';
      const buffer = await renderToBuffer(<SkillSheetDocument title="サイズ" content={markdown} />);
      const pages = await readPdf(buffer);
      const body = pages[0].items.find((item) => item.str.includes('BodySizeProbe'));
      expect(body).toBeDefined();
      // pdf.js の height は実効フォントサイズ。丸め誤差だけを許容する。
      expect(Math.abs((body?.height ?? 0) - FONT_SIZE.BODY)).toBeLessThan(0.5);
    },
    RENDER_TIMEOUT_MS,
  );

  // G の副作用チェック。文字を大きくした結果ページ数が極端に増えていないこと。
  it(
    'G: 本文を大きくしてもページ数が高さ見積りから求まる枚数を超えない（Issue #263 G）',
    async () => {
      const markdown = projectBlockToMarkdown(buildDemoProjects(12));
      const buffer = await renderToBuffer(<SkillSheetDocument title="ページ数" content={markdown} />);
      const pages = await readPdf(buffer);

      // 見積り（layout-metrics の上振れ見積り）から求まるページ数を上限の目安にする。
      // カードが不必要に1枚ずつ独立ページへ追いやられるような退行はここで落ちる。
      const estimated = Math.ceil(estimateBlocksHeight(parseMarkdown(markdown), CONTENT_WIDTH) / CONTENT_HEIGHT);
      expect(pages.length).toBeLessThanOrEqual(estimated + 1);
    },
    RENDER_TIMEOUT_MS,
  );
});
