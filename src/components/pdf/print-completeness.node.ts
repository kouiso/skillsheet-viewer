/**
 * PDF の「全件全文」完全性ゲート。
 *
 * 既存の 7 項目品質検査（print-quality.ts）は「壊れていないか」（文字の重なり・見出しの
 * 無いページ・空ページ・表からの溢れ・小さすぎる文字・ページ番号の欠落・任意の必須文字列の
 * 有無）を見る。ここは別の質問に答える: **「元データにある事実は、印刷結果のどこかに
 * 全部載っているか」**。
 *
 * この検査を作った理由は、7 項目のどれにも引っかからない欠落が実際に見つかったこと。
 * `PRINT_CHIP_LIMIT`（1 分類 6 件）を超えた技術名は「他 N 件」に畳まれて紙面から消え、
 * 27 案件中 16 案件・合計 68 個の技術名が読めなくなっていた（`no-abbreviated-rendering`
 * skill の origin）。簡約版カード（`project-card-compact.tsx`）はメタ表（役割・技術領域・
 * 担当工程）を丸ごと出さない。どちらも「崩れてはいないが事実が消えている」形で、
 * 座標ベースの品質検査は原理的に検出できない。ここは DB の値そのものを列挙し、
 * PDF のテキストレイヤーに 1 個ずつ照合することで、この種の欠落を機械で数える。
 *
 * 「欠落として数えない」= 本人の意思で消した場合の 2 パターンだけ:
 *  1. hidden な会社・案件（`filterVisibleProjectData` で除外される）
 *  2. 画面のビュートグルで OFF にしたセクション（`views`）
 * それ以外（簡約版カードの省略・チップ上限の「他 N 件」など「レイアウトの都合」）は
 * **ここでは除外しない**。除外すると、この検査を作った理由そのものが消える。
 */

import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { Block, ProjectTech } from '@/db/blocks';
import { filterVisibleProjectData, orderedProfileMetaEntries, resolveProfileMetaLabel } from '@/db/blocks';
import { flattenTech, TECH_BUCKET_LABELS, TECH_BUCKET_ORDER } from '@/db/process';

import { MARKDOWN_REMARK_PLUGINS } from '@/lib/markdown-config';
import type { QualityPage } from './print-quality';
import { PRINT_SIZE } from './print-tokens';
import type { PrintViewKey } from './print-view-model';
import { buildPrintViewModel } from './print-view-model';

const ALL_VIEWS: PrintViewKey[] = ['skills', 'process', 'projects', 'timeline'];

/**
 * プロフィール帯（1 行 3 列）に収まらず、スキル一覧ページの `expertiseRows` へ回る値の
 * 文字数しきい値。`print-view-model.ts` の同名定数（非公開）と同じ値を保つ。
 * 表示先が variance するこの分岐だけは、事実の enumerate 側でも知っておく必要がある
 * （'skills' ビューが OFF だとその値の印刷経路自体が無くなるため）。
 */
const PROFILE_SHORT_VALUE_CHARS = 30;

export type CompletenessCategory = 'profile' | 'stats' | 'pr' | 'company' | 'project';

/** 「印刷結果のどこかに載っているはず」の 1 個の事実。 */
export interface CompletenessFact {
  category: CompletenessCategory;
  /** どの実体の事実か（会社名・案件名・'page1'）。欠落レポートのグルーピング単位。 */
  scope: string;
  /** 人間向けの説明（例: "技術(言語): TypeScript" "業務内容 2行目"）。 */
  label: string;
  /** PDF のテキストレイヤーに現れるはずの原文（正規化前）。 */
  text: string;
}

export interface CompletenessFinding {
  fact: CompletenessFact;
}

export interface CompletenessReport {
  totalFacts: number;
  totalFound: number;
  missing: CompletenessFinding[];
}

function trimmed(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function pushFact(
  out: CompletenessFact[],
  category: CompletenessCategory,
  scope: string,
  label: string,
  text: string | undefined,
): void {
  const value = trimmed(text);
  if (value) out.push({ category, scope, label, text: value });
}

function emptyTech(): ProjectTech {
  return { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] };
}

// --- Markdown → 「1 行」(PrintMarkdown が 1 ブロックとして描く単位) -------------------
//
// duties / acquired / comment / pr は remark でパースし、段落・箇条書き項目（ネスト含む）・
// blockquote の中身・code ブロックをそれぞれ 1 事実にする。`print-markdown.tsx` の
// renderBlock / renderListItem と同じ分割単位に合わせることで、「1 事実 = PDF 上で
// 1 つながりの文字列になる範囲」という対応を保証する。行 = `\n` 区切りにすると、
// 1 つの段落が折り返しただけの改行まで別事実として扱ってしまい、正しく描画されていても
// 過検出になる。

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

const markdownProcessor = unified().use(remarkParse).use(MARKDOWN_REMARK_PLUGINS);

function inlineText(nodes: MdNode[] | undefined): string {
  if (!nodes) return '';
  return nodes
    .map((node) => {
      if (node.type === 'text' || node.type === 'inlineCode') return node.value ?? '';
      if (node.type === 'break') return ' ';
      // print-markdown.tsx の renderInline も html ノードは描画しない（rehype-sanitize の
      // 対象外になる生タグを PDF 本文に literal で出さないため）。
      if (node.type === 'html') return '';
      if (node.children) return inlineText(node.children);
      return node.value ?? '';
    })
    .join('');
}

function collectMarkdownBlocks(node: MdNode, out: string[]): void {
  if (node.type === 'paragraph') {
    out.push(inlineText(node.children));
    return;
  }
  if (node.type === 'list') {
    for (const item of node.children ?? []) {
      const children = item.children ?? [];
      const ownBlocks = children.filter((c) => c.type !== 'list');
      const nestedLists = children.filter((c) => c.type === 'list');
      // renderListItem と同じ結合: 自分の直下ブロックのインライン文字列を連結したものが
      // 1 個の BulletRow になる（箇条書き記号 "—" 自体は別の Text なのでここには含めない）。
      out.push(ownBlocks.map((block) => inlineText(block.children)).join(''));
      for (const nested of nestedLists) collectMarkdownBlocks(nested, out);
    }
    return;
  }
  if (node.type === 'blockquote') {
    for (const child of node.children ?? []) collectMarkdownBlocks(child, out);
    return;
  }
  if (node.type === 'code') {
    if (node.value) out.push(node.value);
    return;
  }
  if (node.children) {
    out.push(inlineText(node.children));
    return;
  }
  if (node.value) out.push(node.value);
}

/** 自由記述 1 フィールドを、PrintMarkdown が描くのと同じ単位の文字列配列にする。 */
export function extractMarkdownFacts(markdown: string): string[] {
  const text = trimmed(markdown);
  if (!text) return [];
  const tree = markdownProcessor.runSync(markdownProcessor.parse(text)) as unknown as MdNode;
  const out: string[] = [];
  for (const child of tree.children ?? []) collectMarkdownBlocks(child, out);
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

// --- 正規化 --------------------------------------------------------------------
//
// 落としてよいのは「レンダリングの都合で生じる、内容とは無関係な表記ゆれ」だけ。
// ここで適用する 4 種類:
//  1. 空白類 — 折り返し・両端揃えで PDF 側の空白の入り方が変わる（実測）。
//  2. チルダの異体字（U+FF5E/U+301C/U+2053/U+223C）— 全角チルダ/波ダッシュ/約物のゆれ。
//  3. Markdown 記法文字（* _ `）— AST 抽出済みの事実には通常出てこないが、
//     `company.note`（Paragraph 直描画・remark を通さない）のような生文字列との
//     対称性のため、事実側・PDF 側の両方に同じ正規化をかける。
//  4. 箇条書き記号（— U+2014 ／ • U+2022）— BulletRow が本文とは別に挿す記号。
//
// **ハイフン（U+002D "-"）は落とさない。** 行の途中に "-" が混入するのはハイフネーションの
// 実害（この直前のセッションで見つかった回帰: 「エッジデプロイ、-アクセス解析は」）で、
// これを正規化で消すと「直っていないのに緑」になる。この検査の存在理由を潰すため厳禁。
const WHITESPACE = /\s+/g;
const TILDE_VARIANTS = /[～〜⁓∼]/g;
const MARKDOWN_SYNTAX_CHARS = /[*_`]/g;
const BULLET_GLYPHS = /[—•]/g;

export function normalizeForMatch(text: string): string {
  return text
    .replace(TILDE_VARIANTS, '~')
    .replace(BULLET_GLYPHS, '')
    .replace(MARKDOWN_SYNTAX_CHARS, '')
    .replace(WHITESPACE, '');
}

/**
 * running footer（氏名 ／ シート名 ／ ページ番号）の描画が絶対に超えない Y 座標。
 *
 * `printStyles.page`（print-primitives.tsx）は `paddingBottom: PRINT_SIZE.padBottom + 14`
 * を持ち、本文はこの内側にしか描かれない。footer 自身は `position:absolute, bottom:
 * PRINT_SIZE.footerBottom` の別レイヤーなので、本文の下端（この Y 座標）より下に
 * 来ることはない。
 *
 * 最初は `print-quality.ts` の `footerBandHeight`（ページ最下端から 40pt、DEFAULT_QUALITY_
 * OPTIONS 由来）を流用したが、実測で 1 ページ目のプロフィール帯（最終行が footer からわずか
 * 34pt）まで巻き込んで消してしまった（「最寄り駅」が missing になった）。あちらは「ページの
 * 見出しを探す」ための閾値で「本文を取りこぼさず footer だけを除く」目的とは要求が違うため、
 * 流用をやめてページ設計そのものの定数から計算する。
 */
const FOOTER_TOP_Y = PRINT_SIZE.padBottom + 14;

/**
 * ページの本文 item だけを、running footer を除いて復元する。
 *
 * 全ページに出る `RunningFooter`（print-primitives.tsx）は、pdfjs の抽出順では
 * そのページの本文の**直後**に来る（実測）。footer を含めたまま連結すると、長い
 * duties/acquired/comment がページをまたいだ瞬間に footer の文字列が本文の途中に
 * 割り込み、続きのページと連結しても 1 本の文字列に戻らない（実測: 「認証基盤では」が
 * 「認」+ footer + 「証基盤では」に分断されていた）。この分断は壊れではなく全ページに
 * 出る正常な仕様なので、正規化ではなく「footer 帯を除く」ことで対処する。
 */
function footerFilteredItems(page: QualityPage): QualityPage {
  const withoutFooter = page.filter((item) => item.y >= FOOTER_TOP_Y);
  return withoutFooter.length > 0 ? withoutFooter : page;
}

/**
 * ページ 1 枚ぶんの本文を、正規化後の文字列と「その各文字が元は何個目の pdfjs item に
 * 属していたか」の対応付きで保持する。案件の見出しページを探すときに、地の文への言及
 * （後述）と本物の見出しを区別するための材料になる。
 *
 * `normalizeForMatch` の 4 種類の変換（空白除去・チルダ統一・Markdown 記法文字除去・
 * 箇条書き記号除去）はどれも「文字単体の削除／置換」で、前後の item との結合には依存
 * しない。そのため item ごとに正規化してから連結した文字列は、`footerFilteredItems(page)`
 * の各 item の生テキストを先に連結してから `normalizeForMatch` を 1 回だけ掛けた文字列
 * （こちらの書き方の方が素直だが item 境界の対応が失われる）と常に一致する。
 */
interface NormalizedPage {
  text: string;
  /** `text` 上で各 item が占める半開区間。item の出現順のまま保持する。 */
  itemSpans: Array<{ start: number; end: number }>;
}

function buildNormalizedPage(page: QualityPage): NormalizedPage {
  const itemSpans: Array<{ start: number; end: number }> = [];
  let text = '';
  for (const item of footerFilteredItems(page)) {
    const start = text.length;
    text += normalizeForMatch(item.text);
    itemSpans.push({ start, end: text.length });
  }
  return { text, itemSpans };
}

/**
 * `key` がこのページの中に「見出しとして」現れているかを判定する。
 *
 * 会社概要の地の文（`company.note`）は、複数の案件名を「業務委託にて、A、B を担当。」の
 * ように 1 文の中で羅列する。この文字列は改行も区切り文字も無いまま案件名を含むため、
 * 単純な部分文字列一致では「本文中の言及」と「その案件のカード自体の見出し」を区別
 * できない（実測: E社の概要が『3D メディア販売向けのポートフォリオサイトの構築』に
 * 言及した時点でその案件の開始ページと誤認し、実際のカード 1 ページぶんが範囲の外に
 * 出て 21 個の事実が missing 化した）。
 *
 * 見出しは `project-card-detail.tsx` / `project-card-compact.tsx` がその案件名だけを
 * 単独の `PrintText` として描画するため、pdfjs の item 境界が案件名の先頭・末尾と
 * ぴったり揃う（実測: 見出し側は item が "3" から "構築" まで案件名の文字だけで完結する。
 * 地の文側は同じ案件名が "にて、3"（前方に余分な文字が同居した item）から始まる）。
 * 地の文はその文全体が変数長の item に分割されるだけで、案件名の前後で item が
 * 綺麗に切れる保証が無い。この「item 境界が一致するか」を見出しかどうかの判定に使う。
 */
function hasHeadingOccurrence(np: NormalizedPage, key: string): boolean {
  if (!key) return false;
  let from = 0;
  for (;;) {
    const idx = np.text.indexOf(key, from);
    if (idx === -1) return false;
    const end = idx + key.length;
    const startsAtItem = np.itemSpans.some((span) => span.start === idx);
    const endsAtItem = np.itemSpans.some((span) => span.end === end);
    if (startsAtItem && endsAtItem) return true;
    from = idx + 1;
  }
}

// --- 事実の列挙 ------------------------------------------------------------------

/**
 * ブロック配列から「印刷結果のどこかに載っているはずの事実」を列挙する。
 *
 * 会社・案件の組み立ては `buildPrintViewModel`（画面と PDF が共有する唯一のビューモデル）を
 * そのまま使う。理由は 2 つ:
 *  - hidden フィルタ・会社ごとのグルーピング・簡約/詳細の判定を、ここで再実装すると
 *    基準がずれて「検査だけ通る/検査だけ落ちる」誤差が生まれる。
 *  - 技術チップの上限（PRINT_CHIP_LIMIT）による切り捨てだけは view model の出力
 *    （`techGroups`）に既に反映されてしまっているため、そこだけは raw の
 *    `ProjectTech`（`filterVisibleProjectData` 通過後）から `flattenTech` で
 *    分類ごとに取り直す。
 */
export function enumerateCompletenessFacts(blocks: Block[], views: PrintViewKey[] = ALL_VIEWS): CompletenessFact[] {
  const on = (key: PrintViewKey) => views.includes(key);
  const facts: CompletenessFact[] = [];
  // sheetTitle はここでは無視してよい（このファイルの呼び出し元が別途タイトル文字列の
  // 有無を検証する対象ではなく、あらゆる呼び出しで固定の "エンジニアスキルシート" になる）。
  const vm = buildPrintViewModel('', blocks, views);

  // --- 1 ページ目: 氏名・肩書き・プロフィール項目・統計・自己紹介 ---
  const profile = blocks.find((b): b is Extract<Block, { type: 'profile' }> => b.type === 'profile')?.data;
  const stats = blocks.find((b): b is Extract<Block, { type: 'stats' }> => b.type === 'stats')?.data;

  pushFact(facts, 'profile', 'page1', '氏名', profile?.name);
  pushFact(facts, 'profile', 'page1', '肩書き', profile?.title);

  // 所属 + meta の各項目。buildSummary と同じ並びで集め、30 文字を超える値は
  // 1 ページ目ではなくスキル一覧ページ（skills-page.tsx の expertiseRows）に回る。
  // 'skills' ビューが OFF だとその印刷経路自体が無い＝意図的な不在（欠落として数えない）。
  const metaEntries: [string, string][] = [];
  if (trimmed(profile?.company)) metaEntries.push(['所属', trimmed(profile?.company)]);
  for (const [key, value] of orderedProfileMetaEntries(profile?.meta)) {
    metaEntries.push([resolveProfileMetaLabel(key), value]);
  }
  for (const [label, value] of metaEntries) {
    if (value.length > PROFILE_SHORT_VALUE_CHARS && !on('skills')) continue;
    pushFact(facts, 'profile', 'page1', `プロフィール: ${label}`, value);
  }

  // 生の profile.pr ではなく vm.summary.pr を使う。stripDecorativeHeading（print-view-model.ts）
  // が飾りの見出し行（「♦ 自己紹介」等）を意図的に落としており、それは欠落ではなく
  // 二重見出しを避けるための正しい変換のため（raw のままだと必ず missing になる）。
  extractMarkdownFacts(vm.summary.pr).forEach((line, i) => {
    facts.push({ category: 'pr', scope: 'page1', label: `自己紹介 ${i + 1}段落目`, text: line });
  });

  for (const item of stats?.items ?? []) {
    const value = trimmed(item.value);
    const unit = trimmed(item.unit);
    const label = trimmed(item.label);
    // buildSummary と同じ「3 つとも空なら出さない」判定。
    if (!value && !unit && !label) continue;
    const title = label || '(無題)';
    pushFact(facts, 'stats', 'page1', `統計「${title}」の値`, value);
    pushFact(facts, 'stats', 'page1', `統計「${title}」の単位`, unit);
    pushFact(facts, 'stats', 'page1', '統計のラベル', label);
  }

  // --- 会社・案件（'projects' ビューが OFF だとセクションごと出ない） ---
  if (on('projects')) {
    const projectBlock = blocks.find((b): b is Extract<Block, { type: 'project' }> => b.type === 'project')?.data;
    const visibleItems = projectBlock ? filterVisibleProjectData(projectBlock).items : [];
    const techById = new Map(visibleItems.map((item) => [item.id, item.tech]));

    for (const company of vm.companies) {
      const scope = company.name;
      facts.push({ category: 'company', scope, label: '会社名', text: company.name });
      pushFact(facts, 'company', scope, '区分', company.kind);
      pushFact(facts, 'company', scope, '在籍期間', company.periodText);
      pushFact(facts, 'company', scope, '会社概要', company.note);

      for (const project of company.projects) {
        const projectScope = project.title;
        facts.push({ category: 'project', scope: projectScope, label: '案件名', text: project.title });

        // 期間: 簡約版と詳細版で「印刷される文字列そのもの」が違う
        // （project-card-compact.tsx は compactPeriodText、project-card-detail.tsx は
        // periodText を使う）。年の省略は情報を失わない書式変換であり、
        // PRINT_CHIP_LIMIT の「他 N 件」やメタ表の省略とは性質が違うため、
        // ここでは「省略＝欠落」として扱わず、実際に描画される側の文字列だけを事実にする。
        const periodText = project.level === 'detail' ? project.periodText : project.compactPeriodText;
        pushFact(facts, 'project', projectScope, '期間', periodText);

        pushFact(facts, 'project', projectScope, 'チーム規模', project.team);

        // metaRows は 役割 / 技術領域(or 担当領域) / チーム / 担当工程 のうち値がある行だけ。
        // 'チーム' は上の「チーム規模」と同じ値なので二重に数えない。
        // 簡約版カードはこの表自体を描かない（project-card-compact.tsx）ため、
        // 簡約版の案件ではここが軒並み「欠落」として出る。これは no-abbreviated-rendering
        // skill の判定基準どおり本物の欠落であり、レベル判定で握りつぶさない。
        for (const row of project.metaRows) {
          if (row.label === 'チーム') continue;
          facts.push({ category: 'project', scope: projectScope, label: row.label, text: row.value });
        }

        // 技術名: view model の techGroups は PRINT_CHIP_LIMIT で切り捨てた後の値なので
        // 使わない。raw の ProjectTech（hidden フィルタ通過後）から分類ごとに取り直す。
        const tech = techById.get(project.id);
        if (tech) {
          for (const bucket of TECH_BUCKET_ORDER) {
            const names = flattenTech({ ...emptyTech(), [bucket]: tech[bucket] ?? [] });
            for (const name of names) {
              facts.push({
                category: 'project',
                scope: projectScope,
                label: `技術(${TECH_BUCKET_LABELS[bucket]}): ${name}`,
                text: name,
              });
            }
          }
        }

        extractMarkdownFacts(project.duties).forEach((line, i) => {
          facts.push({ category: 'project', scope: projectScope, label: `業務内容 ${i + 1}行目`, text: line });
        });
        extractMarkdownFacts(project.acquired).forEach((line, i) => {
          facts.push({ category: 'project', scope: projectScope, label: `習得スキル・実績 ${i + 1}行目`, text: line });
        });
        extractMarkdownFacts(project.comment).forEach((line, i) => {
          facts.push({ category: 'project', scope: projectScope, label: `コメント ${i + 1}行目`, text: line });
        });
      }
    }
  }

  return facts;
}

// --- PDF テキストとの照合 ---------------------------------------------------------

/**
 * ブロック配列から列挙した事実を、抽出済みの PDF ページ配列と突き合わせる。
 *
 * 案件ごとの事実（技術名・メタ表・本文行）は、**その案件が乗っているページ範囲だけ**を
 * 相手に探す。文書全体から探すと、複数案件で使い回される技術名（React / TypeScript /
 * AWS 等）や似た文言が「別の案件の記述で見つかった」ことになり、当の案件では
 * PRINT_CHIP_LIMIT で切り捨てられているのに missing を検出できない（実測で確認）。
 * ページ範囲は「案件名が最初に現れるページ」から「次の案件名が現れるページ」まで
 * （境界の 1 ページは両案件で共有する。詳細版カードは前の案件の本文が乗ったまま次の
 * 案件の見出しが同じページに始まることがあり、`nextStart - 1` で切ると本文ごと
 * 範囲の外に出て誤検出になる — 実測で発見）。案件名自体と、会社・プロフィール・
 * 統計など単一箇所にしか現れない事実は文書全体を相手にする。
 *
 * ページをまたいで分割された本文は、境界に**もう 1 種類**の割り込みが入る（実測で発見）。
 * 詳細版カードの継続ヘッダー（`DynamicView fixed`、project-card-detail.tsx）と簡約表の
 * 列ヘッダー（`CompactTableHeader`）はどちらも `fixed` で、pdfjs の抽出順では継続先
 * ページの**先頭**（本文の直前）に literal に出る（実測: 「…を統合。認」の直後、次の
 * ページの先頭に「企業向けドキュメント管理・AI活用支援システム（続き）A社（大手
 * SIベンダー）2025.06~2025.07」が丸ごと乗ってから「証基盤では…」の続きが始まる —
 * 制御文字などの区切りは無く、単にそのページの最初の内容として出る）。
 *
 * 「案件名（続き）」自体は blind に（文書全体から）剥がしてよい — 初出には絶対に
 * 付かない接尾辞なので、正しい初出を巻き込む心配がない。だが続く会社名・期間・稼働期間は
 * 接尾辞を持たず、**同じ文字列がその案件の初出ページにも正しく出る**。ここを blind に
 * 剥がすと、その案件の「期間」の事実そのものを消してしまう（実測で自己回帰: 追加した
 * 瞬間に 14 件の期間の欠落を新たに作った）。そのため会社名・期間・稼働期間の除去は
 * 「その案件の**継続ページ**（開始ページより後、終了ページまで）の**先頭**に一致した
 * ときだけ」に絞る。開始ページ自身と、他の案件の初出ページは対象にならないので安全。
 */
export function checkCompleteness(
  facts: CompletenessFact[],
  pages: QualityPage[],
  continuationHeaderNoise: ContinuationHeaderNoise[] = [],
): CompletenessReport {
  // item 境界つきの正規化結果を作っておく（`hasHeadingOccurrence` が使う）。
  // `np.text` はページを 1 本の文字列として正規化したものと常に一致する
  // （buildNormalizedPage のコメント参照）ため、以降の rawPageTexts はここから作る。
  const normalizedPages = pages.map(buildNormalizedPage);
  const rawPageTexts = normalizedPages.map((np) => np.text);

  // 案件名（続き）・会社名（つづき）と簡約表の列ヘッダーは、初出を巻き込むリスクが無いので
  // blind に剥がす（どの接尾辞も初出には絶対に付かない）。会社見出しの継続表記は
  // 案件見出しと違う表記（漢字「続き」ではなくひらがな「つづき」）を使うレイアウトが
  // 実測されたため、両方を剥がす。
  const bareContinuationTitles = facts
    .filter((f) => f.category === 'project' && f.label === '案件名')
    .map((f) => normalizeForMatch(`${f.text}（続き）`));
  const bareContinuationCompanies = facts
    .filter((f) => f.category === 'company' && f.label === '会社名')
    .flatMap((f) => [normalizeForMatch(`${f.text}（続き）`), normalizeForMatch(`${f.text}（つづき）`)]);
  const COMPACT_TABLE_HEADER = normalizeForMatch('期間 案件 ／ 担当 チーム');
  const globalSafePatterns = [...bareContinuationTitles, ...bareContinuationCompanies, COMPACT_TABLE_HEADER].filter(
    (s) => s.length > 0,
  );

  function stripGlobalSafeNoise(text: string): string {
    let out = text;
    for (const pattern of globalSafePatterns) out = out.split(pattern).join('');
    return out;
  }

  const pageTexts = rawPageTexts.map(stripGlobalSafeNoise);

  const projectScopesInOrder: string[] = [];
  const seenScopes = new Set<string>();
  for (const fact of facts) {
    if (fact.category !== 'project' || seenScopes.has(fact.scope)) continue;
    seenScopes.add(fact.scope);
    projectScopesInOrder.push(fact.scope);
  }

  // 案件名の先頭ページを、直前の案件の開始ページ以降から単調に探す（文書順を前提にする
  // ことで、短い/汎用的なタイトルが文書の前の方に偶然一致する事故を避ける）。
  //
  // まず「見出しとしての一致」（hasHeadingOccurrence）だけを探す。会社概要の地の文が
  // 後続の案件名に言及していても、それは見出しの item 境界を持たないため候補にならず、
  // 本物のカード見出しがあるページまで正しく読み飛ばせる。
  // 見出しとしての一致が 1 件も無いときだけ、旧来のブラインドな部分文字列一致
  // （`pageTexts[i].includes(key)`）にフォールバックする。案件そのものが本当に
  // 描画されていない場合はここでも見つからず、`found === -1` のまま個別の fact 判定
  // （文書全体を相手にする）に委ねられる — 検出を弱めない（見出しの判定基準を厳しく
  // する方向にしか変えていない）。
  const startPage = new Map<string, number>();
  let cursor = 0;
  for (const scope of projectScopesInOrder) {
    const key = normalizeForMatch(scope);
    let found = -1;
    for (let i = cursor; i < normalizedPages.length; i++) {
      if (hasHeadingOccurrence(normalizedPages[i], key)) {
        found = i;
        break;
      }
    }
    if (found === -1) {
      for (let i = cursor; i < pageTexts.length; i++) {
        if (pageTexts[i].includes(key)) {
          found = i;
          break;
        }
      }
    }
    if (found === -1) continue; // 案件名自体が見つからない → 個別の fact 判定で missing になる
    startPage.set(scope, found);
    cursor = found;
  }

  const endPage = new Map<string, number>();
  for (let i = 0; i < projectScopesInOrder.length; i++) {
    const scope = projectScopesInOrder[i];
    const start = startPage.get(scope);
    if (start === undefined) continue;
    let end = pageTexts.length - 1;
    for (let j = i + 1; j < projectScopesInOrder.length; j++) {
      const nextStart = startPage.get(projectScopesInOrder[j]);
      if (nextStart !== undefined) {
        // 次の案件の開始ページ**自身**まで含める（`nextStart - 1` で切ると壊れる）。
        // @react-pdf は密に詰めるため、詳細版カードは前の案件の本文が乗ったまま
        // 次の案件の見出しが同じページに始まる（実測: 動画配信サービス案件のコメントが
        // 次の案件「マッチングアプリの開発」の開始ページと同じページに乗っていた。
        // `nextStart - 1` で切ると、その本文ごと範囲の外に出て「見つからない」误検出になる）。
        // 境界ページを両案件で共有する分だけ、隣接案件間で技術名が誤って「見つかった」
        // ことになるリスクはあるが、本文を丸ごと取りこぼす方が実害が大きい。
        end = Math.max(start, nextStart);
        break;
      }
    }
    endPage.set(scope, end);
  }

  // 会社名・期間・稼働期間は、その案件自身の「継続ページ」の先頭に一致したときだけ剥がす
  // （開始ページそのものと、他の案件の初出ページは対象にしない）。
  for (const noise of continuationHeaderNoise) {
    const start = startPage.get(noise.scope);
    const end = endPage.get(noise.scope);
    if (start === undefined || end === undefined) continue;
    const pattern = normalizeForMatch(noise.text);
    if (!pattern) continue;
    for (let p = start + 1; p <= end; p++) {
      if (pageTexts[p].startsWith(pattern)) pageTexts[p] = pageTexts[p].slice(pattern.length);
    }
  }

  const globalHaystack = pageTexts.join('');
  const rangeHaystack = new Map<string, string>();
  for (const scope of projectScopesInOrder) {
    const start = startPage.get(scope);
    const end = endPage.get(scope);
    if (start === undefined || end === undefined) continue;
    rangeHaystack.set(scope, pageTexts.slice(start, end + 1).join(''));
  }

  const missing: CompletenessFinding[] = [];
  let totalFound = 0;
  for (const fact of facts) {
    const key = normalizeForMatch(fact.text);
    if (!key) continue;
    // 案件名そのものは範囲探索の前提になる事実なので、範囲に自分自身を探す循環を避けて
    // 文書全体で判定する。
    const isTitleFact = fact.category === 'project' && fact.label === '案件名';
    const haystack = isTitleFact ? globalHaystack : (rangeHaystack.get(fact.scope) ?? globalHaystack);
    if (haystack.includes(key)) {
      totalFound += 1;
    } else {
      missing.push({ fact });
    }
  }

  return { totalFacts: facts.length, totalFound, missing };
}

/** `checkCompleteness` の `continuationHeaderNoise` に渡す 1 件（案件スコープ付き）。 */
export interface ContinuationHeaderNoise {
  /** どの案件の継続ページに出る断片か（その案件の継続ページ範囲だけを対象にする）。 */
  scope: string;
  /** 剥がす文字列（正規化前）。 */
  text: string;
}

/**
 * 詳細版カードの `fixed` 継続ヘッダーが literal に挿し込む、案件名以外の断片
 * （会社名・期間・稼働期間）を組み立てる。`checkCompleteness` はこれを、対応する案件の
 * **継続ページの先頭に一致したときだけ**剥がす（初出ページや他の案件は対象にしない）。
 * 簡約版カード（`project-card-compact.tsx`）は行ごとの `fixed` ヘッダーを持たないため対象外。
 */
export function buildContinuationHeaderNoise(
  blocks: Block[],
  views: PrintViewKey[] = ALL_VIEWS,
): ContinuationHeaderNoise[] {
  const vm = buildPrintViewModel('', blocks, views);
  const noise: ContinuationHeaderNoise[] = [];
  for (const company of vm.companies) {
    for (const project of company.projects) {
      if (project.level !== 'detail') continue;
      // 先頭の `${title}（続き）` は含めない。checkCompleteness 側で案件名（続き）は
      // 既に blind に剥がしてあるため、それを含めた文字列を渡すと先頭が一致しなくなる
      // （実測で発見した自己バグ）。残りの会社名・期間・稼働期間だけを渡す。
      noise.push({
        scope: project.title,
        text: `${project.companyLabel}${project.periodText}${project.durationText}`,
      });
    }
  }
  return noise;
}

/** 列挙 + 照合をまとめて行う。 */
export function buildCompletenessReport(
  blocks: Block[],
  pages: QualityPage[],
  views: PrintViewKey[] = ALL_VIEWS,
): CompletenessReport {
  const facts = enumerateCompletenessFacts(blocks, views);
  const extraNoise = buildContinuationHeaderNoise(blocks, views);
  return checkCompleteness(facts, pages, extraNoise);
}

/** 欠落を `category:scope` でグルーピングする（レポート表示用）。 */
export function groupMissingByScope(missing: CompletenessFinding[]): Map<string, CompletenessFinding[]> {
  const grouped = new Map<string, CompletenessFinding[]>();
  for (const finding of missing) {
    const key = `${finding.fact.category}:${finding.fact.scope}`;
    grouped.set(key, [...(grouped.get(key) ?? []), finding]);
  }
  return grouped;
}
