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
import { resolveDisplayedSkillExperience } from '@/db/derived-display';
import { flattenTech, TECH_BUCKET_LABELS, TECH_BUCKET_ORDER } from '@/db/process';
import { sanitizeHtml } from '@/db/sanitize-html';

import { MARKDOWN_REMARK_PLUGINS } from '@/lib/markdown-config';
import type { QualityPage } from './print-quality';
import { PRINT_SIZE, PRINT_TOP_SKILL_LIMIT, PRINT_TYPE, PRINT_YEAR_VISIBLE_CATEGORIES } from './print-tokens';
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

export type CompletenessCategory = 'profile' | 'stats' | 'pr' | 'company' | 'project' | 'skills';

/** 「印刷結果のどこかに載っているはず」の 1 個の事実。 */
export interface CompletenessFact {
  /** 簡約表では案件名より前に描画する期間。範囲開始をこの列まで含める。 */
  headingPrefix?: string;
  region?: 'topSkills' | 'strengths' | 'skills';
  category: CompletenessCategory;
  /** どの実体の事実か（会社名・案件名・'page1'）。欠落レポートのグルーピング単位。 */
  scope: string;
  /** 同名案件を区別する内部ID。省略時はscopeを使う。 */
  scopeId?: string;
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
  const body = withoutFooter.length > 0 ? withoutFooter : page;
  // pdfjsのyは下端原点。本文はA4高さ842pt−上余白42pt以下にあり、
  // この上の絶対配置ヘッダーは省略記号で「続き」が消えても本文に混ぜない。
  return body.filter((item) => item.y <= PRINT_SIZE.pageHeight - PRINT_SIZE.padTop);
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

/** 本文中の言及を避け、item境界または通し番号の直後にある案件名を探す。 */
function headingOccurrence(np: NormalizedPage, key: string, from = 0): number {
  if (!key) return -1;
  for (;;) {
    const idx = np.text.indexOf(key, from);
    if (idx === -1) return -1;
    const end = idx + key.length;
    // 通し番号と案件名の先頭が同じpdfjs itemに入る場合もある。
    const startsAtItem = np.itemSpans.some(
      (span) =>
        span.start === idx || (span.start < idx && span.end > idx && /^\d+\.$/.test(np.text.slice(span.start, idx))),
    );
    const endsAtItem = np.itemSpans.some((span) => span.end === end);
    const isContinuation = np.text.slice(end).startsWith('（続き）');
    if (startsAtItem && endsAtItem && !isContinuation) return idx;
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
export function enumerateCompletenessFacts(
  blocks: Block[],
  views: PrintViewKey[] = ALL_VIEWS,
  referenceMonth?: number,
): CompletenessFact[] {
  const on = (key: PrintViewKey) => views.includes(key);
  const facts: CompletenessFact[] = [];
  // sheetTitle はここでは無視してよい（このファイルの呼び出し元が別途タイトル文字列の
  // 有無を検証する対象ではなく、あらゆる呼び出しで固定の "エンジニアスキルシート" になる）。
  const vm = buildPrintViewModel('', blocks, views, referenceMonth);

  // --- 1 ページ目: 氏名・肩書き・プロフィール項目・統計・自己紹介 ---
  const profile = blocks.find((b): b is Extract<Block, { type: 'profile' }> => b.type === 'profile')?.data;

  pushFact(facts, 'profile', 'page1', '氏名', profile?.name);
  pushFact(facts, 'profile', 'page1', '肩書き', profile?.title);

  // VMのスキルや強みが誤って削られても、元ブロックから欠落を検出する。
  for (const [index, strength] of (profile?.strengths ?? []).entries()) {
    pushFact(facts, 'profile', 'page1', `強み ${index + 1}`, sanitizeHtml(strength).trim());
    if (sanitizeHtml(strength).trim()) facts[facts.length - 1].region = 'strengths';
  }
  if (on('skills')) {
    const projectSource = blocks.find(
      (block): block is Extract<Block, { type: 'project' }> => block.type === 'project',
    );
    const projects = projectSource ? filterVisibleProjectData(projectSource.data).items : [];
    const sourceSkills = blocks
      .filter((block): block is Extract<Block, { type: 'skills' }> => block.type === 'skills')
      .flatMap((block, groupIndex) => {
        const category = sanitizeHtml(block.data.category ?? '').trim();
        const skills = (block.data.skills ?? []).filter((skill) => sanitizeHtml(skill.name ?? '').trim());
        if (skills.length > 0) pushFact(facts, 'skills', block.id, 'スキル分類', category);
        return skills.map((skill, skillIndex) => {
          const name = sanitizeHtml(skill.name).trim();
          const experience = resolveDisplayedSkillExperience(skill, projects, referenceMonth);
          const years = PRINT_YEAR_VISIBLE_CATEGORIES.has(category)
            ? experience.label.replace(/^(\d+)年(?:(\d+)ヶ月)?$/, (_, year, month) =>
                month === undefined ? `${year} 年` : `${year} 年 ${month} ヶ月`,
              )
            : '';
          pushFact(facts, 'skills', block.id, `スキル: ${name}`, years ? `${name}（${years}）` : name);
          return {
            name,
            years,
            months: experience.months,
            featured: skill.featured === true,
            order: groupIndex * 1000 + skillIndex,
          };
        });
      });
    const featuredMode = sourceSkills.some((skill) => skill.featured);
    const top = [...sourceSkills]
      .sort(
        (a, b) =>
          (featuredMode ? Number(b.featured) - Number(a.featured) : 0) || b.months - a.months || a.order - b.order,
      )
      .slice(0, PRINT_TOP_SKILL_LIMIT);
    for (const skill of top) {
      pushFact(
        facts,
        'profile',
        'page1',
        `主力スタック: ${skill.name}`,
        skill.years ? `${skill.name} ${skill.years}` : skill.name,
      );
    }
  }

  for (const fact of facts) {
    if (fact.category === 'skills') fact.region = 'skills';
    if (fact.label.startsWith('主力スタック:')) fact.region = 'topSkills';
  }

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

  for (const item of vm.summary.stats) {
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
        const firstFact = facts.length;
        const projectScope = project.title;
        facts.push({
          category: 'project',
          scope: projectScope,
          label: '案件名',
          text: project.title,
          headingPrefix: project.level === 'detail' ? undefined : project.compactPeriodText,
        });

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
        for (let i = firstFact; i < facts.length; i++) facts[i].scopeId = project.id;
      }
    }
  }

  return facts;
}

// --- PDF テキストとの照合 ---------------------------------------------------------

/**
 * 案件見出しから次案件の見出し直前までを照合する。同名案件はscopeIdで分離する。
 * 簡約表の期間列は見出しより前にあるためheadingPrefixまで開始位置を広げる。
 * 継続ページの固定見出しとfooterを除き、改ページした本文を連結する。
 */
export function checkCompleteness(
  facts: CompletenessFact[],
  pages: QualityPage[],
  continuationHeaderNoise: ContinuationHeaderNoise[] = [],
): CompletenessReport {
  // item 境界つきの正規化結果を作っておく（`headingOccurrence` が使う）。
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

  const scopeKey = (fact: { scope: string; scopeId?: string }) => fact.scopeId ?? fact.scope;
  const titles = facts.filter((fact) => fact.category === 'project' && fact.label === '案件名');
  type Position = { page: number; offset: number };
  const starts = new Map<string, Position>();
  let cursor: Position = { page: 0, offset: 0 };
  for (const title of titles) {
    const key = normalizeForMatch(title.text);
    for (let page = cursor.page; page < normalizedPages.length; page++) {
      const offset = headingOccurrence(normalizedPages[page], key, page === cursor.page ? cursor.offset : 0);
      if (offset === -1) continue;
      const beforeTitle = normalizedPages[page].text.slice(0, offset);
      const prefix = normalizeForMatch(title.headingPrefix ?? '');
      const prefixStart = prefix ? beforeTitle.lastIndexOf(prefix) : -1;
      const between = prefixStart >= 0 ? beforeTitle.slice(prefixStart + prefix.length) : '';
      const startOffset = prefixStart >= 0 && (between === '' || /^\d+\.$/.test(between)) ? prefixStart : offset;
      starts.set(scopeKey(title), { page, offset: startOffset });
      cursor = { page, offset: offset + key.length };
      break;
    }
  }

  // ページ境界ではなく次案件の見出し位置で切る。前案件の続きは残し、隣接案件の
  // 同文・同技術による欠落の埋め合わせを防ぐ。見出し不在時に全体検索へ逃がさない。
  const rangeHaystack = new Map<string, string>();
  for (let index = 0; index < titles.length; index++) {
    const scope = scopeKey(titles[index]);
    const start = starts.get(scope);
    if (!start) continue;
    const next = titles
      .slice(index + 1)
      .map((title) => starts.get(scopeKey(title)))
      .find(Boolean);
    const end = next ?? { page: rawPageTexts.length - 1, offset: rawPageTexts.at(-1)?.length ?? 0 };
    const segments: string[] = [];
    for (let page = start.page; page <= end.page; page++) {
      let text = stripGlobalSafeNoise(
        rawPageTexts[page].slice(page === start.page ? start.offset : 0, page === end.page ? end.offset : undefined),
      );
      if (page > start.page) {
        for (const noise of continuationHeaderNoise) {
          if (scopeKey(noise) !== scope) continue;
          const pattern = normalizeForMatch(noise.text);
          if (pattern && text.startsWith(pattern)) text = text.slice(pattern.length);
        }
      }
      segments.push(text);
    }
    rangeHaystack.set(scope, segments.join(''));
  }
  const globalHaystack = pageTexts.join('');
  // 同じ技術名が案件や一覧にあっても、表紙の主力チップの代わりにはしない。
  const fragments = pages.flatMap((page, pageIndex) =>
    footerFilteredItems(page).map((item) => ({ ...item, pageIndex })),
  );
  // pdfjsは和文見出しを複数itemへ分割する。同じベースライン・サイズの隣接断片を復元する。
  const items: typeof fragments = [];
  for (const item of fragments) {
    const previous = items.at(-1);
    if (
      previous &&
      previous.pageIndex === item.pageIndex &&
      Math.abs(previous.y - item.y) < 0.2 &&
      Math.abs(previous.size - item.size) < 0.2 &&
      item.x >= previous.x &&
      item.x - (previous.x + previous.width) >= -0.2 &&
      item.x - (previous.x + previous.width) < 2
    ) {
      previous.text += item.text;
      previous.width = item.x + item.width - previous.x;
    } else items.push({ ...item });
  }
  const atLeft = (item: (typeof items)[number]) => Math.abs(item.x - PRINT_SIZE.padHorizontal) < 2;
  const heading = (item: (typeof items)[number], names: string[], size: number) =>
    atLeft(item) && Math.abs(item.size - size) < 0.2 && names.includes(normalizeForMatch(item.text));
  const skillStart = items.findIndex((item) => heading(item, ['スキル一覧'], PRINT_TYPE.company.fontSize));
  const projectPages = [...starts.values()].map((position) => position.page);
  const firstProjectPage = projectPages.length ? Math.min(...projectPages) : pages.length;
  const summaryEnd = skillStart >= 0 ? skillStart : items.findIndex((item) => item.pageIndex >= firstProjectPage);
  const summaryItems = items.slice(0, summaryEnd < 0 ? undefined : summaryEnd);
  const metaLabels = facts
    .filter((fact) => fact.label.startsWith('プロフィール: '))
    .map((fact) => normalizeForMatch(fact.label.slice('プロフィール: '.length)));
  const sectionNames = [
    ...metaLabels,
    '主力スタック',
    '主力スタック（経験年数）',
    '対応可能工程',
    '得意分野',
    '自己紹介',
  ];
  const summaryRegion = (names: string[]) => {
    const start = summaryItems.findIndex((item) => heading(item, names, PRINT_TYPE.sectionLabel.fontSize));
    if (start < 0) return '';
    const tail = summaryItems.slice(start + 1);
    const end = tail.findIndex((item) => heading(item, sectionNames, PRINT_TYPE.sectionLabel.fontSize));
    return tail
      .slice(0, end < 0 ? undefined : end)
      .map((item) => normalizeForMatch(item.text))
      .join('');
  };
  const regionHaystacks = {
    topSkills: summaryRegion(['主力スタック', '主力スタック（経験年数）']),
    strengths: summaryRegion(['得意分野']),
    skills:
      skillStart < 0
        ? ''
        : items
            .slice(skillStart + 1)
            .filter((item) => item.pageIndex < firstProjectPage)
            .map((item) => normalizeForMatch(item.text))
            .join(''),
  };

  const missing: CompletenessFinding[] = [];
  let totalFound = 0;
  const regionOccurrences = new Map<string, number>();
  for (const fact of facts) {
    const key = normalizeForMatch(fact.text);
    if (!key) continue;
    const haystack = fact.region
      ? regionHaystacks[fact.region]
      : fact.category === 'project'
        ? (rangeHaystack.get(scopeKey(fact)) ?? '')
        : globalHaystack;
    const occurrenceKey = `${fact.region}:${key}`;
    const occurrence = haystack.indexOf(key, fact.region ? (regionOccurrences.get(occurrenceKey) ?? 0) : 0);
    if (occurrence >= 0) {
      if (fact.region) regionOccurrences.set(occurrenceKey, occurrence + key.length);
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
  /** 同名案件を区別する内部ID。省略時はscopeを使う。 */
  scopeId?: string;
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
  referenceMonth?: number,
): ContinuationHeaderNoise[] {
  const vm = buildPrintViewModel('', blocks, views, referenceMonth);
  const noise: ContinuationHeaderNoise[] = [];
  for (const company of vm.companies) {
    for (const project of company.projects) {
      if (project.level !== 'detail') continue;
      // 先頭の `${title}（続き）` は含めない。checkCompleteness 側で案件名（続き）は
      // 既に blind に剥がしてあるため、それを含めた文字列を渡すと先頭が一致しなくなる
      // （実測で発見した自己バグ）。残りの会社名・期間・稼働期間だけを渡す。
      noise.push({
        scope: project.title,
        scopeId: project.id,
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
  referenceMonth?: number,
): CompletenessReport {
  const facts = enumerateCompletenessFacts(blocks, views, referenceMonth);
  const extraNoise = buildContinuationHeaderNoise(blocks, views, referenceMonth);
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
