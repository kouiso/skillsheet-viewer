// スキルシートの DB ブロック → Word（docx）生成。
// 内容は PDF 出力と同じ経路（blocksToMarkdown → remark mdast）から作る。
// PDF が mdast を @react-pdf プリミティブへ落とすのと同じ形で、ここでは
// 同じ mdast を docx のプリミティブ（Paragraph/Table/TextRun）へ落とすため、
// 見出し・太字・箇条書き・表の構成は PDF 出力と一致する。
import 'server-only';

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  type IParagraphOptions,
  LevelFormat,
  Packer,
  Paragraph,
  type ParagraphChild,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import type { MdNode } from '@/component/pdf/mdast';
import { type Block, blocksToMarkdown } from '@/db/block';
import { DESIGN_TOKENS_LIGHT } from '@/lib/design-token';
import { isSafeLinkHref, PDF_REMARK_PLUGINS } from '@/lib/markdown-config';

// 配色は PDF（pdf-theme が参照する DESIGN_TOKENS_LIGHT）と同じトークンを使う。
// '#' 付きの CSS 値を docx の 6 桁 hex へ変換するだけで、値自体はコピーしない。
const hex = (cssColor: string): string => cssColor.replace('#', '').toUpperCase();
const COLOR = {
  primary: hex(DESIGN_TOKENS_LIGHT.primary),
  primaryDark: hex(DESIGN_TOKENS_LIGHT.primaryDark),
  text: hex(DESIGN_TOKENS_LIGHT.foreground),
  border: hex(DESIGN_TOKENS_LIGHT.border),
  muted: hex(DESIGN_TOKENS_LIGHT.muted),
} as const;

// 提出用文書として Windows/Mac の両 Office に標準搭載される游ゴシックを既定にする。
// 等幅（コード・inlineCode）は環境差の少ない Courier New。
const FONT = 'Yu Gothic';
const FONT_MONO = 'Courier New';

// docx の size 指定は半ポイント単位（20 = 10pt）。
const SIZE = {
  body: 20,
  title: 32,
  h1: 30,
  h2: 26,
  h3: 22,
  h4: 20,
} as const;

const convertMm = (mm: number): number => Math.round(mm * 56.7);

// A4 縦・余白は PDF の左右約 20mm に合わせる（twip = 1/20 pt）。
const PAGE = {
  width: 11906,
  height: 16838,
  margin: convertMm(20),
};
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

const headingSize = (depth: number): number =>
  depth <= 1 ? SIZE.h1 : depth === 2 ? SIZE.h2 : depth === 3 ? SIZE.h3 : SIZE.h4;

interface InlineOpts {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  mono?: boolean;
  size?: number;
  color?: string;
}

// PDF の render-node.tsx と同じ扱い: strong=太字、emphasis=斜体、delete=取消線、
// inlineCode=等幅、html(インライン)=描画しない、break=強制改行。
function inlineRuns(node: MdNode, opts: InlineOpts = {}): ParagraphChild[] {
  const run = (text: string, extra: InlineOpts = {}): TextRun =>
    new TextRun({
      text: xmlSafe(text),
      font: extra.mono || opts.mono ? FONT_MONO : FONT,
      bold: extra.bold ?? opts.bold,
      italics: extra.italics ?? opts.italics,
      strike: extra.strike ?? opts.strike,
      size: opts.size ?? SIZE.body,
      color: opts.color ?? COLOR.text,
    });

  // テキスト中の \n（markdown の soft break）は w:t 内では改行にならないため、
  // 明示的な break ランへ分解する（PDF の Text は \n をそのまま改行として描く）。
  const textWithBreaks = (value: string, extra: InlineOpts = {}): ParagraphChild[] =>
    value
      .split('\n')
      .flatMap((part, i) => [...(i > 0 ? [new TextRun({ break: 1 })] : []), ...(part ? [run(part, extra)] : [])]);

  switch (node.type) {
    case 'text':
      return textWithBreaks(node.value ?? '');
    case 'break':
      return [new TextRun({ break: 1 })];
    case 'inlineCode':
      return textWithBreaks(node.value ?? '', { mono: true });
    case 'strong':
      return (node.children ?? []).flatMap((c) => inlineRuns(c, { ...opts, bold: true }));
    case 'emphasis':
      return (node.children ?? []).flatMap((c) => inlineRuns(c, { ...opts, italics: true }));
    case 'delete':
      return (node.children ?? []).flatMap((c) => inlineRuns(c, { ...opts, strike: true }));
    case 'link': {
      // 画面/PDF と同じく安全でないスキームはクリックできない文字として残す
      // （isSafeLinkHref は markdown-config の共有判定。本文の表示自体は落とさない）。
      const children = (node.children ?? []).flatMap((c) => inlineRuns(c, { ...opts, color: COLOR.primary }));
      const href = node.url ?? '';
      if (!isSafeLinkHref(href)) return children;
      return [new ExternalHyperlink({ children, link: xmlSafe(href) })];
    }
    case 'image': {
      // PDF と同じく画像は貼らないが、代替テキストは本文として残す（内容を落とさない）。
      const alt = (node as { alt?: string }).alt ?? '';
      return alt ? textWithBreaks(alt) : [];
    }
    case 'html':
      return [];
    default:
      if (node.children) return node.children.flatMap((c) => inlineRuns(c, opts));
      return node.value ? [run(node.value)] : [];
  }
}

const paragraph = (children: ParagraphChild[], opts: IParagraphOptions = {}): Paragraph =>
  new Paragraph({ children, spacing: { after: 100 }, ...opts });

// XML 1.0 で許可されない文字（\x0b \f \x01-\x08 \x0e-\x1f 等）を除去する。
// docx ライブラリは <>&"' をエスケープするが制御文字は素通しのため、
// ユーザー markdown 由来の制御文字が document.xml を well-formed でなくし
// Word がファイルを開けなくなる（PDF からのコピペで VT/FF が混入しうる）。
const xmlSafe = (s: string): string =>
  s.replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '');

const stripHtml = (html: string): string => html.replace(/<[^>]*>/g, '').trim();

const ALIGNMENT: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
};

// 2 列（項目|内容）の表はラベル列を狭く（PDF の LABEL_FLEX:VALUE_FLEX = 3:7）。
// それ以外は均等配分。
function columnWidths(columnCount: number): number[] {
  if (columnCount === 2) {
    const label = Math.round((CONTENT_WIDTH * 3) / 10);
    return [label, CONTENT_WIDTH - label];
  }
  const w = Math.floor(CONTENT_WIDTH / columnCount);
  return Array.from({ length: columnCount }, (_, i) => (i === columnCount - 1 ? CONTENT_WIDTH - w * i : w));
}

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 1, color: COLOR.border } as const;
const TABLE_BORDERS = {
  top: CELL_BORDER,
  bottom: CELL_BORDER,
  left: CELL_BORDER,
  right: CELL_BORDER,
  insideHorizontal: CELL_BORDER,
  insideVertical: CELL_BORDER,
};

function renderTable(node: MdNode): Table {
  const rows = node.children ?? [];
  // GFM 表は行ごとのセル数が不一致になりうる（ユーザーmarkdown由来）。
  // 先頭行基準だとはみ出たセルで width が undefined になり TableCell が例外を投げるため、
  // 最もセル数の多い行に合わせる。
  const columnCount = Math.max(0, ...rows.map((r) => r.children?.length ?? 0));
  const widths = columnWidths(columnCount);
  const align = node.align ?? [];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths,
    borders: TABLE_BORDERS,
    rows: rows.map(
      (row, ri) =>
        new TableRow({
          // 先頭行はヘッダ — ページをまたいだとき各ページ先頭へ繰り返される。
          tableHeader: ri === 0,
          children: (row.children ?? []).map(
            (cell, ci) =>
              new TableCell({
                width: { size: widths[ci], type: WidthType.DXA },
                shading: ri === 0 ? { fill: COLOR.muted } : undefined,
                children: [
                  paragraph(inlineRuns(cell, { bold: ri === 0 || undefined }), {
                    alignment: ALIGNMENT[align[ci] ?? ''],
                  }),
                ],
              }),
          ),
        }),
    ),
  });
}

interface RenderCtx {
  // リスト項目の先頭ブロックへ付ける箇条書き/番号指定。
  listProps?: { bullet?: { level: number } } | { numbering?: { reference: string; level: number; instance?: number } };
  // blockquote 内の段落へ付ける左インデント（入れ子は累積）。
  indentLeft?: number;
  // 文書内で ordered list が現れるたびに進むカウンタ（参照渡し）。
  // 同一 reference を共有する ordered list は Word では連続採番になるため、
  // リストごとに instance を分けて各リストが 1 から始まるようにする。
  orderedListCounter?: { value: number };
  // このリスト系が属する numbering instance（入れ子リストは親と共有）。
  listInstance?: number;
}

// 箇条書き。順序なしは bullet、順序ありは Decimal の numbering。
// listItem の最初のブロックを行頭記号付き段落にし、残りは通常描画する
// （自由記述に複数段落・入れ子リスト・表が混ざりうるため子要素を潰さない）。
function renderList(node: MdNode, ctx: RenderCtx, level: number): (Paragraph | Table)[] {
  const ordered = Boolean(node.ordered);
  const out: (Paragraph | Table)[] = [];
  for (const item of node.children ?? []) {
    (item.children ?? []).forEach((child, i) => {
      if (child.type === 'list') {
        out.push(...renderList(child, ctx, level + 1));
        return;
      }
      const listProps =
        i === 0
          ? ordered
            ? { numbering: { reference: 'docx-ordered', level: Math.min(level, 8), instance: ctx.listInstance } }
            : { bullet: { level: Math.min(level, 8) } }
          : undefined;
      out.push(...renderBlock(child, { ...ctx, listProps }));
    });
  }
  return out;
}

function renderBlock(node: MdNode, ctx: RenderCtx = {}): (Paragraph | Table)[] {
  const indent = ctx.indentLeft ? { left: ctx.indentLeft } : undefined;
  switch (node.type) {
    case 'heading': {
      const depth = node.depth ?? 1;
      return [
        paragraph(
          inlineRuns({ type: 'paragraph', children: node.children }, { bold: true, size: headingSize(depth) }),
          {
            // PDF の minPresenceAhead と同じく、見出しがページ末尾に孤立しないよう
            // 次の段落/表と一緒に改ページさせる。
            heading: HEADING_LEVELS[Math.min(Math.max(depth, 1), 6) - 1],
            keepNext: true,
            ...ctx.listProps,
            indent: ctx.listProps ? undefined : indent,
            spacing: { before: 240, after: 120 },
          },
        ),
      ];
    }
    case 'paragraph':
      return [
        paragraph(inlineRuns({ type: 'paragraph', children: node.children }, {}), {
          ...ctx.listProps,
          indent: ctx.listProps ? undefined : indent,
        }),
      ];
    case 'list': {
      // ordered list ごとに新しい instance を採番し、先頭リストの続き採番を防ぐ。
      // 入れ子リストは renderList 経由で ctx.listInstance を共有するためここでは進めない。
      let nextCtx = ctx;
      if (node.ordered) {
        const counter = ctx.orderedListCounter ?? { value: 0 };
        counter.value += 1;
        nextCtx = { ...ctx, listInstance: counter.value, orderedListCounter: counter };
      }
      return renderList(node, nextCtx, 0);
    }
    case 'table':
      return [renderTable(node)];
    case 'blockquote':
      return renderBlocks(node.children, { ...ctx, indentLeft: (ctx.indentLeft ?? 0) + 360 });
    case 'thematicBreak':
      return [
        paragraph([], {
          indent,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR.border } },
        }),
      ];
    case 'code':
      return [
        paragraph(
          xmlSafe(node.value ?? '')
            .split('\n')
            .flatMap((line, i) => [
              ...(i > 0 ? [new TextRun({ break: 1 })] : []),
              new TextRun({ text: line, font: FONT_MONO, size: SIZE.body }),
            ]),
          { ...ctx.listProps, indent: ctx.listProps ? undefined : indent, shading: { fill: COLOR.muted } },
        ),
      ];
    case 'html': {
      // PDF（renderHtmlBlock）と同じくタグを剥がして本文だけ残す。
      // <h1>-<h6> を含むものは見出しとして描く。
      const raw = node.value ?? '';
      const text = xmlSafe(stripHtml(raw));
      if (!text) return [];
      const isHeading = /<h[1-6][\s>]/i.test(raw);
      return [
        paragraph(
          [
            new TextRun({
              text,
              bold: isHeading,
              size: isHeading ? SIZE.h2 : SIZE.body,
              color: isHeading ? COLOR.primaryDark : COLOR.text,
              font: FONT,
            }),
          ],
          { ...ctx.listProps, indent: ctx.listProps ? undefined : indent, keepNext: isHeading },
        ),
      ];
    }
    default:
      if (node.children) return renderBlocks(node.children, ctx);
      return node.value
        ? [
            paragraph([new TextRun({ text: xmlSafe(node.value), font: FONT, size: SIZE.body, color: COLOR.text })], {
              ...ctx.listProps,
              indent: ctx.listProps ? undefined : indent,
            }),
          ]
        : [];
  }
}

function renderBlocks(nodes: MdNode[] | undefined, ctx: RenderCtx = {}): (Paragraph | Table)[] {
  // listProps（箇条書きマーカー）は先頭の子だけへ伝える。
  // 全子に渡すと blockquote 内の全段落が bullet 化する（item 1 個 = マーカー 1 個の parity）。
  return (nodes ?? []).flatMap((node, i) => renderBlock(node, i === 0 ? ctx : { ...ctx, listProps: undefined }));
}

/**
 * スキルシートのブロック列から応募用 docx を生成する。
 * 内容は blocksToMarkdown（viewer/PDF と同じ正準表現）から作るため、
 * 非表示（hidden）の会社・案件はビューア/PDF と同じく出力しない。
 * referenceMonth も PDF/ビューアと同じ基準月を渡す（経験年数・参画期間の確定用）。
 */
export async function buildSkillSheetDocx(blocks: Block[], title: string, referenceMonth?: number): Promise<Buffer> {
  const content = blocksToMarkdown(blocks, referenceMonth);
  const processor = unified().use(remarkParse).use(PDF_REMARK_PLUGINS);
  const tree = processor.runSync(processor.parse(content)) as unknown as MdNode;

  const doc = new Document({
    creator: 'skillsheet-viewer',
    title: xmlSafe(title),
    numbering: {
      config: [
        {
          reference: 'docx-ordered',
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: { font: FONT, size: SIZE.body, color: COLOR.text },
        },
      },
      paragraphStyles: HEADING_LEVELS.map((level, i) => ({
        id: level,
        name: level,
        run: { font: FONT, bold: true, color: i <= 2 ? COLOR.primaryDark : COLOR.text },
      })),
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE.width, height: PAGE.height },
            margin: { top: PAGE.margin, right: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin },
          },
        },
        children: [
          paragraph(
            [new TextRun({ text: xmlSafe(title), bold: true, size: SIZE.title, color: COLOR.primary, font: FONT })],
            { alignment: AlignmentType.CENTER, spacing: { after: 280 } },
          ),
          ...renderBlocks(tree.children, { orderedListCounter: { value: 0 } }),
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
