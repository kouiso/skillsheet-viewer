import { existsSync } from 'node:fs';
import path from 'node:path';

import { Font, renderToBuffer, View } from '@react-pdf/renderer';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { beforeAll, describe, expect, it } from 'vitest';

import PDF_FONT_FAMILY from './constants';
import type { MdNode } from './skill-sheet-document';
import { renderBlocks, SkillSheetDocument } from './skill-sheet-document';

// public/ 配下の実フォントファイルへの絶対パス。
// 本番（pdf/fonts.ts）はブラウザ向けに URL 参照（/fonts/...）で登録するが、
// Node 上のバイト描画ではファイルシステムから読めないため、ここでは実ファイルパスで登録する。
// ファミリ名は本番と同じ PDF_FONT_FAMILY を使うので、コンポーネントの参照と一致する。
const FONTS_DIR = path.resolve(process.cwd(), 'public', 'fonts');
const REGULAR_OTF = path.join(FONTS_DIR, 'NotoSansJP-Regular.otf');
const BOLD_OTF = path.join(FONTS_DIR, 'NotoSansJP-Bold.otf');

// PDF の先頭マジックバイト（%PDF-）。これが無ければ PDF として成立していない。
const PDF_HEADER = '%PDF-';

// 実バイト描画はフォント登録＋レイアウト計算を伴い、単体では 2〜3 秒だが
// スイート全体の並列実行下では既定の 5 秒を超えることがあるため、余裕を持たせる。
const RENDER_TIMEOUT_MS = 30_000;

function registerNodeFonts(): void {
  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: REGULAR_OTF, fontWeight: 400 },
      { src: BOLD_OTF, fontWeight: 700 },
      // 日本語に true italic は無いため、italic にも同じ字形を割り当てる（本番 fonts.ts と同じ方針）。
      { src: REGULAR_OTF, fontWeight: 400, fontStyle: 'italic' },
      { src: BOLD_OTF, fontWeight: 700, fontStyle: 'italic' },
    ],
  });
}

// 日本語見出し・段落・テーブル・日本語入りコードブロックを含み、
// かつ複数ページに跨る程度の分量を持つ決定的なスキルシート Markdown。
function buildContent(): string {
  const skillRows = Array.from({ length: 40 }, (_, i) => `| 技術${i} | ${i}年 | 業務利用 |`).join('\n');
  const projects = Array.from(
    { length: 6 },
    (_, i) =>
      `\n### ■ プロジェクト${i + 1}\n\n大規模Webアプリケーションの設計・開発を担当しました。\n\n- 要件定義から運用までを一貫して担当\n- パフォーマンス改善で表示速度を改善\n`,
  ).join('\n');

  return [
    '## 概要',
    '',
    'フルスタックエンジニアとして、日本語のスキルシートを **PDF** に変換します。',
    '',
    '## スキル一覧',
    '',
    '| 技術 | 経験年数 | 習熟度 |',
    '| :--- | :--- | :--- |',
    skillRows,
    '',
    '## コード例（日本語コメント込み）',
    '',
    // フェンス付きコードブロック内に日本語を含めることで、P1-4 の tofu（文字化け）回帰を防ぐ。
    '```ts',
    'const 担当者 = "山田太郎"; // 担当者の氏名',
    'function 計算する(金額: number): number {',
    '  // 税込み金額を返す（消費税10%）',
    '  return Math.floor(金額 * 1.1);',
    '}',
    '```',
    '',
    '## 職務経歴',
    projects,
    '',
  ].join('\n');
}

// SkillSheetDocument 本体と同じ remark パイプラインで markdown を mdast ノード列に変換する。
// renderBlocks の構造検証テストで、コンポーネントと同じ木を組み立てるために使う。
function parseMarkdown(content: string): MdNode[] {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkBreaks);
  const tree = processor.runSync(processor.parse(content)) as unknown as MdNode;
  return tree.children ?? [];
}

// React 要素木（@react-pdf/renderer のプレーンな element オブジェクト）を再帰的にたどり、
// Text の中身（文字列）だけを連結して取り出す。実際の描画エンジンを介さず、
// renderBlocks が返す木を直接検証するために使う。
function flattenText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (typeof node === 'object' && node !== null && 'props' in node) {
    return flattenText((node as { props?: { children?: unknown } }).props?.children);
  }
  return '';
}

// N行の項目/内容テーブルを持つ、実際の projectBlockToMarkdown / skillsBlockToMarkdown
// が生成する形（見出し + 直後の表）に近い小さな案件カード風 markdown を組み立てる。
function buildCardMarkdown(heading: string, rowCount: number): string {
  const rows = Array.from({ length: rowCount }, (_, i) => `| 項目${i} | 内容${i} |`).join('\n');
  return [heading, '', '| 項目 | 内容 |', '| :--- | :--- |', rows, ''].join('\n');
}

describe('renderBlocks（見出し+表の結合 wrap 制御の構造検証）', () => {
  it('1ページに収まる見込みの小さな表（案件カード相当）は見出し+表を1つのViewにまとめ wrap={false} にする', () => {
    // projectBlockToMarkdown 相当（期間/役割/規模/技術スタック/担当工程 程度で最大6行前後）を想定した
    // 小さな表。CARD_MAX_ROWS を下回るため、見出し+表がまとめて分割不可になるべき。
    const nodes = parseMarkdown(buildCardMarkdown('### 株式会社テスト — テストシステム開発', 4));
    const rendered = renderBlocks(nodes) as unknown[];

    // 見出し+表が1つの要素にまとめられ、他の兄弟が無いため出力は1要素のみになる。
    expect(rendered).toHaveLength(1);
    const merged = rendered[0] as {
      type: unknown;
      props: { wrap?: boolean; minPresenceAhead?: number; children: unknown[] };
    };

    expect(merged.type).toBe(View);
    // 1ページに収まる見込みなので分割不可（wrap=false）でまとめられている。
    expect(merged.props.wrap).toBe(false);
    // 見出し単独でページ末尾に残らないよう minPresenceAhead が設定されている。
    expect(merged.props.minPresenceAhead).toBeGreaterThan(0);
    // 見出しと表の2要素が1つの View の子としてまとまっている。
    expect(Array.isArray(merged.props.children)).toBe(true);
    expect(merged.props.children).toHaveLength(2);

    const text = flattenText(merged);
    expect(text).toContain('株式会社テスト — テストシステム開発');
    expect(text).toContain('内容0');
  });

  it('1ページに収まらない見込みの表（行数が多いスキルカテゴリ相当）は wrap={true} のままクリップを防ぐ', () => {
    // CARD_MAX_ROWS(14) を超える行数の表。文字数自体は短くても行数超過で
    // 「収まらない見込み」と判定され、見出し+表を丸ごと不可分にはしない
    // （renderTable 内の行単位 wrap 制御に委ねてクリップを防ぐ）。
    const nodes = parseMarkdown(buildCardMarkdown('### 多い項目のカテゴリ', 20));
    const rendered = renderBlocks(nodes) as unknown[];

    expect(rendered).toHaveLength(1);
    const merged = rendered[0] as {
      type: unknown;
      props: { wrap?: boolean; minPresenceAhead?: number; children: unknown[] };
    };

    expect(merged.type).toBe(View);
    // 収まらない見込みなので分割を許容する（wrap=true）。
    expect(merged.props.wrap).toBe(true);
    // 収まらない場合でも見出し単独残留を防ぐ minPresenceAhead は維持される。
    expect(merged.props.minPresenceAhead).toBeGreaterThan(0);
    expect(merged.props.children).toHaveLength(2);
  });

  it('見出しの直後が表でない場合（通常の段落など）は結合せず、見出しを単独描画する', () => {
    const nodes = parseMarkdown(['## 概要', '', '通常の説明文です。', ''].join('\n'));
    const rendered = renderBlocks(nodes) as unknown[];

    // 見出しと段落、それぞれ独立した要素として出力される（結合されない）。
    expect(rendered).toHaveLength(2);
    const heading = rendered[0] as { type: unknown; props: { wrap?: boolean; children: unknown } };
    expect(heading.type).toBe(View);
    // 表と結合されていないので wrap は明示設定されない（結合ケースのように boolean が入らない）。
    expect(heading.props.wrap).toBeUndefined();
  });
});

describe('SkillSheetDocument（実バイト描画）', () => {
  beforeAll(() => {
    // 実ファイルが無いと描画は成立しないため前提を明示する。
    expect(existsSync(REGULAR_OTF)).toBe(true);
    expect(existsSync(BOLD_OTF)).toBe(true);
    registerNodeFonts();
  });

  it(
    '登録済み Noto Sans JP で日本語入りコードを含む非空の %PDF バッファを描画できる',
    async () => {
      const buffer = await renderToBuffer(
        <SkillSheetDocument title="山田太郎 スキルシート" content={buildContent()} />,
      );

      // 非空であること。
      expect(buffer.length).toBeGreaterThan(0);
      // PDF として成立していること（先頭が %PDF-）。
      expect(buffer.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER);
      // 末尾に PDF の終端マーカー（%%EOF）があり、途中で壊れていないこと。
      expect(buffer.subarray(-1024).toString('latin1')).toContain('%%EOF');
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    '同一入力に対して決定的に %PDF バッファを描画する（2回とも成立）',
    async () => {
      const content = buildContent();
      const first = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
      const second = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);

      for (const buffer of [first, second]) {
        expect(buffer.length).toBeGreaterThan(0);
        expect(buffer.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER);
      }
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    '2行の小さい表に1ページ超の長文セルを含む内容でも正常な PDF バッファを生成できる（行アトミック化の回帰防止）',
    async () => {
      // 表全体は wrap={true}、行は原則 wrap={false}（1行の途中でページを割らない）。
      // ただし1ページに収まらない見込みの行（文字数が閾値超）だけは wrap={true} にして
      // 複数ページにまたがることを許容する（さもないと内容がクリップされる — chatgpt-codex-connector指摘の回帰防止）。
      const longCell = Array.from({ length: 50 }, (_, i) => `行${i + 1}：長い業務内容の説明テキストです。`).join('\n');
      const content = `## 業務詳細\n\n| 項目 | 内容 |\n| :--- | :--- |\n| 主な業務 | ${longCell} |\n| 補足 | 追加情報 |\n`;

      const buffer = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER);
      expect(buffer.subarray(-1024).toString('latin1')).toContain('%%EOF');
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    '多列テーブル＋長い未分割トークン(URL)を含む内容でもスローせず描画できる（セルの overflow:hidden 回帰防止）',
    async () => {
      // 8列テーブル＋URLのような区切り文字のない長いトークンは、修正前は
      // 折返し後の最終行がセル境界を超えて隣列へ視覚的にはみ出していた
      // （PDFをラスタライズして実際に確認済み）。tableCell に overflow: 'hidden'
      // を追加し、セル幅内にクリップされるよう修正した。
      const header = '| 列A | 列B | 列C | 列D | 列E | 列F | 列G | 列H |';
      const sep = '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |';
      const row =
        '| https://example.com/very/long/unbroken/url/path/xxxxxxxxxxxxxxxxxxxxxxxxxx | b | c | d | e | f | g | h |';
      const content = ['## 多列テーブル', '', header, sep, row, ''].join('\n');

      const buffer = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    '表セル内のリンクはクリック注釈(/URI)を生成しない（隣セルへの不可視クリック領域漏れ防止）',
    async () => {
      // 表セル内の <Link> はセル幅で clip されず、クリック注釈が隣セル上に不可視のまま漏れる。
      // セル内リンクは注釈なしの Text として描画するため、PDF バイト列にセル内 URL の
      // /URI 注釈が現れないことを固定する。対照として段落内リンクは注釈が現れる。
      // 注釈オブジェクトは非圧縮でバイト列に平文で出るため URL 部分文字列で判定できる。
      const CELL_URL = 'https://example.com/annot-in-cell-marker';
      const PARA_URL = 'https://example.com/annot-in-para-marker';
      const content = [
        '## リンク注釈テスト',
        '',
        `段落内のリンク: [サイト](${PARA_URL})`,
        '',
        '| 参照 | 備考 |',
        '| :--- | :--- |',
        `| [ドキュメント](${CELL_URL}) | 補足 |`,
        '',
      ].join('\n');

      const buffer = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
      const bytes = buffer.toString('latin1');

      expect(buffer.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER);
      // 段落内リンクは <Link> のまま → /URI 注釈に URL が平文で出る。
      expect(bytes).toContain('annot-in-para-marker');
      // セル内リンクは Text 描画 → 注釈が出ないため URL はバイト列に現れない。
      expect(bytes).not.toContain('annot-in-cell-marker');
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    '32件の案件カード（見出し+表）を含む実データ相当のボリュームでもクラッシュせず複数ページPDFを生成できる（案件カード分断防止の回帰確認）',
    async () => {
      // projectBlockToMarkdown が生成する形（### 会社名 — タイトル 見出し + 直後の
      // 項目/内容 表）を模した案件カードを32件並べる。Issue #147 (b) の再現条件
      // （32件中16件でページ境界分断）に近いボリュームで、クラッシュしないことと
      // 正常な複数ページPDFが生成されることを確認する。
      const cards = Array.from({ length: 32 }, (_, i) =>
        [
          `### 株式会社サンプル${i} — 案件${i}のシステム開発`,
          '',
          '| 項目 | 内容 |',
          '| :--- | :--- |',
          `| 期間 | 202${i % 5}.04〜202${(i % 5) + 1}.03 |`,
          '| 役割 | エンジニア |',
          '| 規模・スコープ | 5名 |',
          '| 技術スタック | TypeScript, React, Next.js |',
          '| 担当工程 | 要件定義, 設計, 実装, テスト |',
          '',
          '**業務内容**',
          '',
          '要件定義から運用までを一貫して担当しました。',
          '',
        ].join('\n'),
      ).join('\n');
      const content = ['## 職務経歴', '', cards].join('\n');

      const buffer = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
      const bytes = buffer.toString('latin1');

      expect(buffer.length).toBeGreaterThan(0);
      expect(bytes.slice(0, PDF_HEADER.length)).toBe(PDF_HEADER);
      expect(bytes.slice(-1024)).toContain('%%EOF');
      // 32件の案件カードは1ページに収まらない分量のため、複数ページに分かれて
      // いることを確認する（/Type /Page の出現数で概算。/Type /Pages とは区別する）。
      const pageObjectCount = (bytes.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
      expect(pageObjectCount).toBeGreaterThan(1);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    '6カテゴリ中2つが行数超過（15行以上）のスキル一覧でもクラッシュせず正常なPDFを生成できる（スキル表のページ境界分断防止の回帰確認）',
    async () => {
      // skillsBlockToMarkdown が生成する形（### カテゴリ名 見出し + 直後のスキル表）を
      // 6カテゴリ分並べ、うち2カテゴリだけ CARD_MAX_ROWS(14) を超える行数にして
      // Issue #147 (c) の再現条件（6カテゴリ中2つでページ境界分断）に近いボリュームにする。
      const buildCategory = (name: string, rowCount: number) => {
        const rows = Array.from({ length: rowCount }, (_, i) => `| ${name}${i} | ${i}年 | 業務利用 |`).join('\n');
        return [`### ${name}`, '', '| スキル | 経験年数 | 習熟度 |', '| :--- | :--- | :--- |', rows, ''].join('\n');
      };
      const categories = [
        buildCategory('プログラミング言語', 25),
        buildCategory('フレームワーク', 6),
        buildCategory('データベース', 5),
        buildCategory('インフラ', 20),
        buildCategory('ツール', 4),
        buildCategory('その他', 3),
      ].join('\n');
      const content = ['## スキル一覧', '', categories].join('\n');

      const buffer = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
      const bytes = buffer.toString('latin1');

      expect(buffer.length).toBeGreaterThan(0);
      expect(bytes.slice(0, PDF_HEADER.length)).toBe(PDF_HEADER);
      expect(bytes.slice(-1024)).toContain('%%EOF');
      const pageObjectCount = (bytes.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
      expect(pageObjectCount).toBeGreaterThan(1);
    },
    RENDER_TIMEOUT_MS,
  );
});
