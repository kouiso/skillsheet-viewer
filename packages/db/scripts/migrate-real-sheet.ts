/**
 * 本番の実シート「エンジニアスキルシート」(sheetId固定)の 180個の legacy markdown ブロックを
 * パースし、既存の profile/stats/skills ブロックはそのまま維持しつつ project ブロック1つを
 * 新規に組み立てて、saveSkillSheetBlocks で置き換える（--write 時のみ）。
 *
 * 実行:
 *   ドライラン(DB書き込みなし。/tmp/migrated_project_block.json に出力): pnpm --filter @skillsheet/db exec tsx scripts/migrate-real-sheet.ts
 *   本番書き込み: pnpm --filter @skillsheet/db exec tsx scripts/migrate-real-sheet.ts --write
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type {
  BlockInput,
  CompanyInfo,
  ProfileBlockData,
  ProfileMeta,
  ProjectItem,
  ProjectTech,
  SkillEntry,
  SkillsBlockData,
} from '../src/blocks';

const SHEET_TITLE = 'エンジニアスキルシート';

function loadWebEnvLocal(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '../../../apps/web/.env.local');
  // テストからこのモジュールを import したときに throw しないよう、無ければ黙って返す。
  // 実行に必要な環境変数が欠けている場合は main() 側で明示的に停止する。
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadWebEnvLocal();

// loadWebEnvLocal() より後に評価する。SHEET_ID を先に定数化していると
// apps/web/.env.local 側の SHEET_ID 上書きが process.env へ反映される前に
// 読まれてしまい、無視される（レビュー指摘。--write時に誤ったシートを更新しうる）。
const SHEET_ID = process.env.SHEET_ID ?? '18a79e66-75e2-47e8-922e-d61342bb5233';

const newId = () => crypto.randomUUID();

// --- markdown テーブル行パース --------------------------------------------------------

// "| ラベル | 値 |" 形式の行から [ラベル, 値] を取り出す（区切り行 :--- は呼び出し側で除外）。
function parseTableRow(line: string): [string, string] | null {
  const m = line.match(/^\|(.+)\|(.+)\|$/);
  if (!m) return null;
  const label = m[1].trim();
  const value = m[2].trim();
  if (/^:?-+:?$/.test(label)) return null;
  return [label, value];
}

function stripBold(s: string): string {
  return s.replace(/\*\*/g, '').trim();
}

// --- 取り込みで捨てられた行の検出 ----------------------------------------------------------
// 元データに想定外の構造（見出しより前の自由文・未知のサブセクション等）があると、
// パーサはその行をどのフィールドにも入れないまま黙って落とす。案件21の前置き一文が
// DB から消えていた #151 D-7 が実例で、同じ構造の元データが他にもありうるため、
// 捨てた行を集めて取り込み時に警告する。
export type DroppedLine = { where: string; line: string };

/** `|---|:---:|` のような表の区切り行。データではないため捨てても警告しない。 */
export function isTableSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
  const cells = trimmed.split('|').slice(1, -1);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

/** 空行と表の区切り行を除いた「本来データだったはずの行」だけを記録する。 */
function recordDropped(dropped: DroppedLine[], where: string, line: string): void {
  if (!line.trim()) return;
  if (isTableSeparatorRow(line)) return;
  dropped.push({ where, line: line.trim() });
}

// parseProjectBlock が実際に読むサブセクション。これ以外の見出しは誰も参照しないため、
// 中身が丸ごと失われる（例: `#### 備考`）。
const KNOWN_SUBSECTIONS = ['プロジェクト概要', '技術スタック', '担当工程', 'コメント'];

// main() が経歴セクションを切り出す起点。会社見出しより前に唯一存在してよい見出し。
const CAREER_SECTION_HEADING = /^##\s*経歴/;

const SKILLS_SECTION_TITLE = /スキル・経験年数/;
const HTML_WRAPPER_TAG = /^<\/?(?:details|summary|h[1-6])[\s/>]/i;

/**
 * スキルセクションの `<details>` ラッパーと、セクション見出しを兼ねる `<summary>`/`<hN>` だけを
 * 構造行とみなす。タグ名だけで一律に除外すると `<h3>補足</h3>` のような想定外の見出しまで
 * 見逃すため、タグを剥がした中身が空かセクション見出しの場合に限る（Codexレビュー指摘）。
 */
function isSkillsStructuralLine(line: string): boolean {
  const trimmed = line.trim();
  if (!HTML_WRAPPER_TAG.test(trimmed)) return false;
  const text = trimmed.replace(/<[^>]*>/g, '').trim();
  return text === '' || SKILLS_SECTION_TITLE.test(text);
}

// 担当工程表で「経験なし」を表す記号。値が失われているわけではないため警告しない。
const PROCESS_NEGATIVE_MARKERS = new Set(['-', '‐', '−', 'ー', '―', '×', '✕', '✗', '無', 'なし', 'N/A', 'n/a']);

// 末尾の "(3 ヶ月間)" / "（継続中）" 等の注記を取り除く。
function stripTrailingAnnotation(s: string): string {
  return s.replace(/[\s]*[（(][^）)]*[）)]\s*$/, '').trim();
}

// "2025 年 11 月" / "2025 年" / "現在" のようなトークンを "2025.11" / "2025" / "現在" へ正規化。
function normalizeDateToken(token: string): string {
  const t = token.trim();
  if (t === '現在') return '現在';
  let m = t.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月$/);
  if (m) return `${m[1]}.${Number(m[2])}`;
  m = t.match(/^(\d{4})\s*年$/);
  if (m) return m[1];
  return t;
}

// ソース特有の "YYYY 年 M 月 - YYYY 年 M 月 (Nヶ月間)" 表記を、process.ts が解釈できる
// "YYYY.M — YYYY.M" 形式へ変換する（process.ts 本体は変更せず、移行スクリプト側で吸収する）。
function normalizePeriod(raw: string): string {
  const cleaned = stripTrailingAnnotation(stripBold(raw));
  const idx = cleaned.indexOf('-');
  if (idx === -1) return normalizeDateToken(cleaned);
  const start = normalizeDateToken(cleaned.slice(0, idx));
  const end = normalizeDateToken(cleaned.slice(idx + 1));
  return `${start} — ${end}`;
}

// --- 技術スタック行ラベル → ProjectTech バケット ----------------------------------------
const TECH_LABEL_MAP: Record<string, keyof ProjectTech> = {
  使用言語: 'lang',
  'フレームワーク・ライブラリ': 'fw',
  データベース: 'db',
  'クラウド・インフラ': 'infra',
  インフラ: 'infra',
  外部サービス: 'tools',
  開発ツール: 'tools',
  コラボレーションツール: 'collab',
};

function emptyTech(): ProjectTech {
  return { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] };
}

// "AWS (ECS / ECR, RDS, S3)" のように括弧内にもカンマを含む値があるため、
// 括弧の深さが0のカンマ/読点でのみ分割する（括弧内のカンマで誤分割しない）。
function splitTechValues(value: string): string[] {
  const OPEN = new Set(['(', '（']);
  const CLOSE = new Set([')', '）']);
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (OPEN.has(ch)) depth++;
    else if (CLOSE.has(ch)) depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === '、') && depth === 0) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out.filter(Boolean);
}

// --- 担当工程テーブル（ヘッダ行=7ラベル固定順、データ行=●マーク）--------------------------
// ソース側のテーブル見出し文字列（列位置の特定にのみ使う）。
const PROCESS_HEADER_ORDER = [
  '要件定義',
  '基本設計',
  '詳細設計',
  '実装・単体',
  '結合テスト',
  '総合テスト',
  '保守・運用',
];
// process.ts の EXACT_MATCH_MAP に完全一致する builder 語彙（出力する文字列はこちらを使う）。
// 「実装・単体」→「実装」、「保守・運用」→「運用・保守」の語彙差を吸収する（ここを合わせないと
// normalizeProcess が該当工程を other 扱いにしてしまい、集計から丸ごと消える）。
const PROCESS_BUILDER_VOCAB = ['要件定義', '基本設計', '詳細設計', '実装', '結合テスト', '総合テスト', '運用・保守'];

function parseProcessSection(lines: string[], dropped: DroppedLine[] = [], where = ''): string[] {
  // ヘッダ行 "| 工程 | 要件定義 | ... |" とデータ行 "| 経験 | ● | ... |" を探す。
  const at = `${where} の「担当工程」`;
  const rows: string[][] = [];
  for (const line of lines) {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    // 表の行でない自由文はこの関数が一切解釈しないため、記録して警告に回す（Codexレビュー指摘）。
    if (cells.length === 0) {
      recordDropped(dropped, `${at}（表の行ではない）`, line);
      continue;
    }
    if (/^:?-+:?$/.test(cells[0])) continue;
    rows.push(cells);
  }
  const asLine = (row: string[]) => `| ${row.join(' | ')} |`;
  if (rows.length < 2) {
    // ヘッダ行だけ等、対で揃っていない場合は何も取り込まれない。
    for (const row of rows) recordDropped(dropped, `${at}（ヘッダ行とデータ行が揃っていない）`, asLine(row));
    return [];
  }
  // 解釈するのは先頭2行（ヘッダ＋データ）だけで、3行目以降は読まれないまま捨てられる。
  for (const row of rows.slice(2)) recordDropped(dropped, `${at}（3行目以降は解釈されない）`, asLine(row));

  const header = rows[0];
  const data = rows[1];
  const result: string[] = [];
  for (let i = 1; i < header.length; i++) {
    const label = header[i];
    const idx = PROCESS_HEADER_ORDER.indexOf(label);
    if (idx === -1) {
      // PROCESS_HEADER_ORDER に無い工程名の列は、どの工程にも対応づかないため値ごと失われる。
      // ● 以外（○ / 担当 / 注記など）でも失われることに変わりはないので、非空なら
      // マーカーの種類を問わず記録する（Codexレビュー指摘）。
      // 見出しセルが空でもデータセルに値があれば、その値は失われる。`label &&` で弾くと
      // `| 工程 | 要件定義 | |` と `| 経験 | | 担当 |` の組が素通りする（Codexレビュー指摘）。
      const unknownCell = (data[i] ?? '').trim();
      if (unknownCell) {
        recordDropped(
          dropped,
          `${at}（未知の工程名）`,
          label ? `${label}: ${unknownCell}` : `${i + 1}列目: ${unknownCell}`,
        );
      }
      continue;
    }
    const cell = data[i] ?? '';
    if (cell.includes('●')) {
      result.push(PROCESS_BUILDER_VOCAB[idx]);
      continue;
    }
    // 既知の工程列でも ● 以外のマーカー（○ / 担当 など）は工程に変換されず失われる。
    // ただし空欄と「経験なし」記号は失っている情報が無いので警告しない。これを警告すると
    // 案件ごとに毎回出て本当の取りこぼしが埋もれる（Codexレビュー指摘）。
    const trimmed = cell.trim();
    if (trimmed && !PROCESS_NEGATIVE_MARKERS.has(trimmed)) {
      recordDropped(dropped, `${at}（解釈できないマーカー）`, `${label}: ${trimmed}`);
    }
  }
  // ヘッダより列数が多いデータ行の余剰セルは、対応する工程名が無く読まれないまま失われる
  // （CodeRabbitレビュー指摘）。
  for (let i = header.length; i < data.length; i++) {
    const extra = (data[i] ?? '').trim();
    if (extra) recordDropped(dropped, `${at}（ヘッダに対応する列が無い）`, extra);
  }
  return result;
}

// --- コメントセクション（≪担当業務≫/≪習得スキル≫/≪コメント≫）------------------------------
function parseCommentSection(text: string): { duties: string; acquired: string; comment: string } {
  const markers = ['≪担当業務≫', '≪習得スキル≫', '≪コメント≫'];
  const positions: { marker: string; index: number }[] = [];
  for (const marker of markers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) positions.push({ marker, index: idx });
  }
  positions.sort((a, b) => a.index - b.index);

  const sectionFor = (marker: string): string => {
    const pos = positions.find((p) => p.marker === marker);
    if (!pos) return '';
    const startIdx = positions.indexOf(pos);
    const start = pos.index + marker.length;
    const end = startIdx + 1 < positions.length ? positions[startIdx + 1].index : text.length;
    return text.slice(start, end).trim();
  };

  if (positions.length === 0) {
    // マーカーが見つからない場合は全文を comment に落とす（データを消さない）。
    return { duties: '', acquired: '', comment: text.trim() };
  }

  // 先頭マーカー前の前置き文（≪担当業務≫等の前の自由文）をコメントに含める。
  // 例: 案件21の "App Store から、PatentStart と検索すると、赤いアプリが表示されます。"
  const preface = text.slice(0, positions[0].index).trim();
  const commentBody = sectionFor('≪コメント≫');
  return {
    duties: sectionFor('≪担当業務≫'),
    acquired: sectionFor('≪習得スキル≫'),
    comment: [preface, commentBody].filter(Boolean).join('\n\n'),
  };
}

// --- プロジェクト見出し "■ (N.)? タイトル" のパース ---------------------------------------
// タイトル末尾の括弧はスコープとして切り離さず、タイトルにそのまま含める。
// 現行ソースでは "モバイル推薦システム開発（連合学習 + クラウド基盤）" のような
// 括弧がタイトルの一部であるケースがあり、取り込みで失われていた（#160）。
function parseProjectHeading(text: string): { title: string; scope: string } {
  const withoutMarker = text.replace(/^■\s*/, '').trim();
  const withoutNumber = withoutMarker.replace(/^\d+\.\s*/, '').trim();
  return { title: withoutNumber, scope: '' };
}

// --- 会社見出し "◆ 会社名 - 期間" のパース -----------------------------------------------
function parseCompanyHeading(text: string): { name: string; period: string } {
  const withoutMarker = text.replace(/^◆\s*/, '').trim();
  const idx = withoutMarker.lastIndexOf('-');
  if (idx === -1) return { name: withoutMarker, period: '' };
  const after = withoutMarker.slice(idx + 1).trim();
  const before = withoutMarker.slice(0, idx).trim();
  if (/年|現在/.test(after)) return { name: before, period: normalizePeriod(after) };
  return { name: withoutMarker, period: '' };
}

// --- プロジェクト1件分（見出し行の次から次の ■ or ### まで）のパース -----------------------
function parseProjectBlock(
  headingText: string,
  bodyLines: string[],
  companyId: string,
  dropped: DroppedLine[] = [],
): ProjectItem {
  const { title, scope } = parseProjectHeading(headingText);
  const where = `案件「${title}」`;

  // サブセクションごとに分割 (#### プロジェクト概要 / #### 技術スタック / #### 担当工程 / #### コメント)
  // null プロトタイプで作る。通常のオブジェクトだと `#### constructor` や `#### toString`
  // のような見出しに対して sections[current] が Object.prototype 由来の値（関数など）を
  // 返し、初回にもかかわらず重複と誤判定した上、反復不能な値への for...of で移行全体が
  // TypeError で停止する（Codexレビュー指摘）。
  const sections: Record<string, string[]> = Object.create(null);
  let current: string | null = null;
  for (const line of bodyLines) {
    const m = line.match(/^####\s*(.+)$/);
    if (m) {
      current = m[1].trim();
      // 同名のサブセクション見出しが再度現れると、それまで溜めた行は上書きで失われる。
      // 上書き後の sections を見るだけでは検出できないため、ここで記録する（Codexレビュー指摘）。
      const overwritten = sections[current];
      if (overwritten) {
        for (const prev of overwritten) recordDropped(dropped, `${where} の重複したサブセクション「${current}」`, prev);
      }
      sections[current] = [];
      continue;
    }
    if (current) sections[current].push(line);
    // 最初のサブセクション見出しより前に書かれた行は、どのフィールドにも入らず捨てられる。
    else recordDropped(dropped, `${where} の冒頭（サブセクション見出しより前）`, line);
  }

  for (const [name, sectionLines] of Object.entries(sections)) {
    if (KNOWN_SUBSECTIONS.includes(name)) continue;
    // 見出し行自体もどの出力フィールドにも入らない。本文が空の場合は子行の記録だけでは
    // 何も残らず、見出しが消えたことに気付けない（Codexレビュー指摘）。
    recordDropped(dropped, `${where} の未知のサブセクション「${name}」`, `#### ${name}`);
    for (const line of sectionLines) recordDropped(dropped, `${where} の未知のサブセクション「${name}」`, line);
  }

  let period = '';
  let role = '';
  let team = '';
  const overviewExtra: string[] = [];
  for (const line of sections.プロジェクト概要 ?? []) {
    const row = parseTableRow(line);
    if (!row) {
      recordDropped(dropped, `${where} の「プロジェクト概要」（表の行として解釈できない）`, line);
      continue;
    }
    const [label, value] = row;
    // 単一値フィールドが二度現れると後勝ちで上書きされ、先の値が失われる（Codexレビュー指摘）。
    const overwriteGuard = (previous: string) => {
      if (previous)
        recordDropped(dropped, `${where} の「プロジェクト概要」（重複した項目の上書き）`, `${label}: ${previous}`);
    };
    if (label === '期間') {
      overwriteGuard(period);
      period = normalizePeriod(value);
    } else if (label === '役割') {
      overwriteGuard(role);
      role = stripBold(value);
    } else if (label === 'チーム規模' || label === 'チーム') {
      overwriteGuard(team);
      team = stripBold(value);
    } else if (value) overviewExtra.push(`${label}: ${stripBold(value)}`);
  }

  const tech = emptyTech();
  for (const line of sections.技術スタック ?? []) {
    const row = parseTableRow(line);
    if (!row) {
      recordDropped(dropped, `${where} の「技術スタック」（表の行として解釈できない）`, line);
      continue;
    }
    // parseTableRow の正規表現は貪欲なので、3セル以上あっても失敗せず「最後のセル以外」を
    // まとめてラベルとして返す。`| 使用言語 | TypeScript | 業務利用 |` は TypeScript が
    // lang から消えて 業務利用 だけが tools に入るため、!row では検出できない
    // （Codexレビュー指摘）。
    const rawCells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (rawCells.length > 2 && !isTableSeparatorRow(line)) {
      recordDropped(dropped, `${where} の「技術スタック」（列が2つを超える）`, line);
      continue;
    }
    const [label, value] = row;
    if (label === '項目') continue; // ヘッダ行
    const bucket = TECH_LABEL_MAP[label] ?? 'tools';
    tech[bucket].push(...splitTechValues(value));
  }

  const process = parseProcessSection(sections.担当工程 ?? [], dropped, where);

  const commentText = (sections.コメント ?? []).join('\n');
  const { duties, acquired, comment } = parseCommentSection(commentText);

  return {
    id: newId(),
    companyId,
    title,
    scope,
    period,
    role,
    team,
    tech,
    process,
    duties: [overviewExtra.length > 0 ? overviewExtra.join('\n') : '', duties].filter(Boolean).join('\n\n'),
    acquired,
    comment,
  };
}

// --- 全体パース：会社ごとに分割 → 各会社内のプロジェクトごとに分割 -------------------------
export function parseCareerMarkdown(markdown: string): {
  companies: CompanyInfo[];
  items: ProjectItem[];
  dropped: DroppedLine[];
} {
  const lines = markdown.split('\n');
  const companies: CompanyInfo[] = [];
  const items: ProjectItem[] = [];
  const dropped: DroppedLine[] = [];

  let currentCompanyId: string | null = null;
  let currentCompanyIntro: string[] = [];
  let currentProjectHeading: string | null = null;
  let currentProjectBody: string[] = [];

  const flushProject = () => {
    if (currentProjectHeading !== null && currentCompanyId !== null) {
      items.push(parseProjectBlock(currentProjectHeading, currentProjectBody, currentCompanyId, dropped));
    } else if (currentProjectHeading !== null) {
      // 会社見出しより前に現れた案件はどの会社にも紐づけられず、見出しごと丸ごと捨てられる。
      recordDropped(dropped, '会社見出しより前の案件', currentProjectHeading);
      for (const line of currentProjectBody) recordDropped(dropped, '会社見出しより前の案件', line);
    }
    currentProjectHeading = null;
    currentProjectBody = [];
  };

  for (const line of lines) {
    const companyMatch = line.match(/^###(?!#)\s*(.+)$/);
    if (companyMatch) {
      flushProject();
      const { name, period } = parseCompanyHeading(companyMatch[1]);
      const note = currentCompanyIntro.join('\n').trim();
      if (currentCompanyId !== null) {
        const prev = companies.find((c) => c.id === currentCompanyId);
        if (prev) prev.note = note;
      }
      const id = newId();
      companies.push({ id, name, kind: '', period, note: '' });
      currentCompanyId = id;
      currentCompanyIntro = [];
      continue;
    }

    const projectMatch = line.match(/^####\s*(■.+)$/);
    if (projectMatch) {
      flushProject();
      currentProjectHeading = projectMatch[1];
      continue;
    }

    if (currentProjectHeading !== null) {
      currentProjectBody.push(line);
    } else if (currentCompanyId !== null) {
      currentCompanyIntro.push(line);
    } else if (!CAREER_SECTION_HEADING.test(line)) {
      // 最初の会社見出し(###)より前の行は、会社にも案件にも属さないまま捨てられる。
      // 除外するのは `## 経歴`（main() がここを起点に切り出す想定済みの構造）だけにする。
      // 見出し行を一律で除外すると `## 注意事項` のような想定外の見出しを見逃す
      // （Codexレビュー指摘）。
      recordDropped(dropped, '最初の会社見出しより前', line);
    }
  }
  flushProject();
  if (currentCompanyId !== null) {
    const prev = companies.find((c) => c.id === currentCompanyId);
    if (prev) prev.note = currentCompanyIntro.join('\n').trim();
  }

  return { companies, items, dropped };
}

// --- 技術者プロファイルパース --------------------------------------------------------------
function deriveSkillLevel(years: number): string {
  if (years >= 5) return '上級';
  if (years >= 2) return '中級';
  return '初級';
}

// ラベル → 代入先の正本。判定と代入を同じ定義から引くことで、片方だけ足して
// 「取り込んでいるのに警告が出る／黙って捨てるのに警告も出ない」ズレを防ぐ
// （CodeRabbitレビュー指摘）。
type ProfileField = 'name' | 'company' | keyof ProfileMeta;
const PROFILE_LABEL_FIELDS: Record<string, ProfileField> = {
  技術者名: 'name',
  所属: 'company',
  所屬: 'company',
  年齢: 'age',
  性別: 'gender',
  資格: 'qualifications',
  学歴: 'education',
  学歷: 'education',
  稼働: 'work',
  勤務形態: 'work',
  最寄駅: 'station',
  最寄り駅: 'station',
  得意分野: 'specialties',
  得意業務: 'expertise',
};

function normalizeProfileLabel(label: string): string {
  return label.replace(/\s+/g, '').replace(/\*/g, '').replace(/:/g, '').trim();
}

export function parseProfileMarkdown(markdown: string, dropped: DroppedLine[] = []): ProfileBlockData | null {
  const lines = markdown.split('\n');
  const startIdx = lines.findIndex((line) => /^##\s*技術者プロファイル/.test(line));
  if (startIdx === -1) return null;
  const at = '技術者プロファイル';

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    // プロファイル内の「### 自己 PR」等はサブセクションとして含めるため、
    // 区切りは `## ` 見出し（次セクション）または <details> の開始のみとする。
    if (/^(?:#{2}\s|<details[\s>])/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  const section = lines.slice(startIdx + 1, endIdx);

  // 自己PR見出し以降は pr へそのまま取り込まれるため、取りこぼしの検査対象は見出しより前だけ。
  const prHeadingIdx = section.findIndex((line) => /^###\s*自己\s*PR/.test(line));
  const scanEnd = prHeadingIdx === -1 ? section.length : prHeadingIdx;

  const meta: ProfileMeta = {};
  let name = '';
  let company = '';
  for (const [i, line] of section.entries()) {
    const report = i < scanEnd;
    if (!line.startsWith('|')) {
      // 表でも自己PRでもない行は、どのフィールドにも入らない（Codexレビュー指摘）。
      if (report) recordDropped(dropped, `${at}（表の行ではない）`, line);
      continue;
    }
    const row = parseTableRow(line);
    if (!row) {
      if (report) recordDropped(dropped, `${at}（表の行として解釈できない）`, line);
      continue;
    }
    const [rawLabel, value] = row;
    const label = normalizeProfileLabel(rawLabel);
    if (label === '項目') continue; // ヘッダ行
    if (!value) continue; // 値が空なら失うものが無い
    // Object.hasOwn を使うのは `constructor` のようなラベルを継承プロパティで拾わないため。
    if (!Object.hasOwn(PROFILE_LABEL_FIELDS, label)) {
      // どの項目にも対応しないラベルは ProfileMeta に入らず失われる
      // （例: `| 居住地 | 東京 |`。Codexレビュー指摘）。
      if (report) recordDropped(dropped, `${at}（対応する項目が無いラベル）`, `${rawLabel}: ${value}`);
      continue;
    }
    const field = PROFILE_LABEL_FIELDS[label];
    // 同じ項目が二度現れると後勝ちで上書きされ、先の値が失われる（Codexレビュー指摘）。
    const previous = field === 'name' ? name : field === 'company' ? company : meta[field];
    if (previous) {
      recordDropped(dropped, `${at}（重複した項目の上書き）`, `${rawLabel}: ${previous}`);
    }
    if (field === 'name') name = value;
    else if (field === 'company') company = value;
    else meta[field] = value;
  }

  const prStart = section.findIndex((line) => /^###\s*自己\s*PR/.test(line));
  const pr =
    prStart !== -1
      ? section
          .slice(prStart + 1)
          .join('\n')
          .trim()
      : '';

  if (!name && !company && Object.values(meta).every((v) => !v) && !pr) {
    return null;
  }

  return { name, title: '', pr, strengths: [], meta, company };
}

export function parseSkillsMarkdown(markdown: string, dropped: DroppedLine[] = []): SkillsBlockData[] {
  const lines = markdown.split('\n');
  let startIdx = lines.findIndex((line) => /^<details[\s>]/.test(line));
  let endIdx = lines.length;
  // <details> で囲まれていれば終端が明示されているので、警告範囲を絞る必要はない。
  const hasDetails = startIdx !== -1;
  if (hasDetails) {
    endIdx = lines.findIndex((line) => /^<\/details>/.test(line), startIdx + 1);
    if (endIdx === -1) endIdx = lines.length;
  } else {
    startIdx = lines.findIndex((line) => SKILLS_SECTION_TITLE.test(line));
    if (startIdx === -1) return [];
  }
  const section = lines.slice(startIdx + 1, endIdx);
  const at = 'スキル・経験年数';
  // <details> が無い経路では endIdx が文末まで伸びる。そのまま警告対象にすると経歴セクション
  // 全体を「捨てた行」として報告してしまうため、パース対象は従来どおりにしたまま、警告の
  // 範囲だけ次の `## ` 見出しまでに絞る。
  // 打ち切るのはこのフォールバック経路だけにする。<details> がある場合にも適用すると、
  // ブロック内の `## 補足` 以降が検査対象から外れて逆に取りこぼす（Codexレビュー指摘）。
  const nextHeadingIdx = hasDetails ? -1 : section.findIndex((line) => /^##\s/.test(line));
  const scanEnd = nextHeadingIdx === -1 ? section.length : nextHeadingIdx;

  const blocks: SkillsBlockData[] = [];
  let currentCategory = '';
  // スキルを1件も持たない分類は出力されず黙って消えるため、元行を控えて警告に回す。
  let currentCategoryLine = '';
  let currentCategoryReport = false;
  const currentSkills: SkillEntry[] = [];

  const flushCategory = () => {
    if (!currentCategory) return;
    if (currentSkills.length > 0) {
      blocks.push({ category: currentCategory, skills: [...currentSkills] });
      return;
    }
    // 分類名だけの行が次の分類または表末尾まで続いた場合、その分類名はどこにも入らない
    // （Codexレビュー指摘）。
    if (currentCategoryReport) recordDropped(dropped, `${at}（スキルが1件も無い技術分類）`, currentCategoryLine);
  };

  for (const [i, line] of section.entries()) {
    const report = i < scanEnd;
    if (!line.startsWith('|')) {
      // 表の行でなければスキルとして取り込まれない（Codexレビュー指摘）。
      // ただし <summary><h2>スキル・経験年数</h2></summary> のような構造行はデータではない。
      // 除外しないと正常な実シートでも毎回 DROPPED_LINES が非ゼロになり、本当の
      // 取りこぼしが恒常的な誤検知に埋もれる（Codexレビュー指摘）。
      if (report && !isSkillsStructuralLine(line)) recordDropped(dropped, `${at}（表の行ではない）`, line);
      continue;
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 3) {
      if (report) recordDropped(dropped, `${at}（列が3つ未満）`, line);
      continue;
    }
    const first = stripBold(cells[0]);
    const skillName = stripBold(cells[1]);
    const yearsRaw = stripBold(cells[2]);
    if (first === '技術分類' || skillName === '技術名' || /^:?-+:?$/.test(first)) continue;

    // 読むのは先頭3セルだけなので、4列目以降の値はどのフィールドにも入らない
    // （Codexレビュー指摘）。
    if (report) {
      for (const extra of cells.slice(3)) {
        if (extra.trim()) recordDropped(dropped, `${at}（4列目以降は読まれない）`, extra);
      }
    }

    if (first) {
      flushCategory();
      currentCategory = first;
      currentCategoryLine = line;
      currentCategoryReport = report;
      currentSkills.length = 0;
    }
    if (!skillName) {
      // 技術名が無い行はスキルにならない。分類名も無ければこの行の内容は丸ごと失われる。
      if (report && !first && yearsRaw) recordDropped(dropped, `${at}（技術名が無い）`, line);
      continue;
    }
    if (!currentCategory) {
      // 分類が未確定のままのスキルは currentSkills に入るが、flushCategory が
      // currentCategory 無しではブロックを出さないため、次の分類行で消える（Codexレビュー指摘）。
      if (report) recordDropped(dropped, `${at}（技術分類が未確定）`, line);
      continue;
    }
    // 部分一致にすると `1年未満` `1年6ヶ月` `約1年` が先頭の `1年` だけ拾って years: 1 になり、
    // 「未満」「6ヶ月」「約」という付加情報を失ったまま警告も出ない。許容する `N年` 形式へ
    // 完全一致させ、それ以外は解釈できない値として記録する（Codexレビュー指摘）。
    const yearsMatch = yearsRaw.match(/^(\d+(?:\.\d+)?)\s*年$/);
    if (report && yearsRaw && !yearsMatch) {
      recordDropped(dropped, `${at}（経験年数を解釈できない）`, `${skillName}: ${yearsRaw}`);
    }
    const years = yearsMatch ? Number(yearsMatch[1]) : 0;
    currentSkills.push({ name: skillName, years, level: deriveSkillLevel(years) });
  }
  flushCategory();

  return blocks;
}

// --- メイン ---------------------------------------------------------------------------
async function main() {
  const write = process.argv.includes('--write');
  // 取りこぼしがあることを承知の上で上書きする場合のみ明示的に指定する。
  const allowDropped = process.argv.includes('--allow-dropped');

  // loadWebEnvLocal() は .env.local が無くても throw しない（テストからの import を許すため）。
  // 実行時にここで明示的に止め、接続先不明のまま進まないようにする。
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL が未設定です。apps/web/.env.local を用意するか、環境変数で渡してください。');
  }

  const { getDb } = await import('../src/client');
  const { blocks: blocksTable } = await import('../src/schema');
  const { eq, asc } = await import('drizzle-orm');
  const { isStatsBlockData } = await import('../src/blocks');

  const db = getDb();
  const rows = await db
    .select()
    .from(blocksTable)
    .where(eq(blocksTable.sheetId, SHEET_ID))
    .orderBy(asc(blocksTable.order));

  const statsBlocks: BlockInput[] = [];
  const markdownParts: string[] = [];
  let skippedExistingProject = false;
  for (const r of rows) {
    if (r.type === 'stats' && isStatsBlockData(r.data)) statsBlocks.push({ type: 'stats', data: r.data });
    else if (r.type === 'markdown') markdownParts.push((r.data as { markdown: string }).markdown);
    else if (r.type === 'project') {
      // 再実行（process.ts語彙修正の再適用等）を想定し、既存 project ブロックは
      // 再構築対象として無視する（元の legacy markdown からの再パースを正とする）。
      skippedExistingProject = true;
    } else if (r.type === 'profile' || r.type === 'skills') {
      // プロフィール・スキルは元 markdown から再生成するため既存ブロックは無視。
      // markdown が無い場合は上位で fallback エラーになるため、ここでは単にスキップ。
    } else throw new Error(`未対応の既存ブロック type=${r.type} order=${r.order}（データ消失防止のため中断）`);
  }
  if (skippedExistingProject)
    console.log(
      'NOTE: 既存の project ブロックは無視し、legacy markdown（無ければ /tmp/real_markdown.md）から再構築します',
    );

  const fallbackMarkdownPath = '/tmp/real_markdown.md';
  const fullMarkdown =
    markdownParts.length > 0
      ? markdownParts.join('\n')
      : existsSync(fallbackMarkdownPath)
        ? readFileSync(fallbackMarkdownPath, 'utf-8')
        : (() => {
            throw new Error('legacy markdown が DB にも /tmp/real_markdown.md にも見つかりません');
          })();

  // プロフィール・スキル・経歴の3パーサすべての取りこぼしを1つに集約する。経歴だけを
  // 見ていると、プロフィールやスキルで行が失われていても DROPPED_LINES: 0 と表示され、
  // --write が警告なしに legacy markdown を置き換えてしまう（Codexレビュー指摘）。
  const dropped: DroppedLine[] = [];
  const profile = parseProfileMarkdown(fullMarkdown, dropped);
  const skills = parseSkillsMarkdown(fullMarkdown, dropped);

  const careerStart = fullMarkdown.search(/^##\s*経歴/im);
  const careerMarkdown = careerStart !== -1 ? fullMarkdown.slice(careerStart) : fullMarkdown;
  const { companies, items, dropped: careerDropped } = parseCareerMarkdown(careerMarkdown);
  // `## 経歴` が無い入力では careerMarkdown が文書全体になるため、プロフィールとスキルが
  // 正常に取り込んだ行まで「最初の会社見出しより前」として返ってくる。この経路でそのまま
  // 集約すると取り込み済みの行を誤って警告するので、その分類だけ除く（Codexレビュー指摘）。
  dropped.push(
    ...(careerStart !== -1 ? careerDropped : careerDropped.filter((d) => d.where !== '最初の会社見出しより前')),
  );

  console.log('PARSED_PROFILE:', profile ? 'yes' : 'no');
  console.log(
    'PARSED_SKILLS_CATEGORIES:',
    skills.length,
    'TOTAL_SKILLS:',
    skills.reduce((acc, s) => acc + s.skills.length, 0),
  );
  console.log('PARSED_COMPANIES:', companies.length);
  console.log('PARSED_PROJECTS:', items.length);

  // 捨てた行がある＝元データの一部が DB に入らないということなので、黙って進めない（#151 D-7）。
  console.log('DROPPED_LINES:', dropped.length);
  if (dropped.length > 0) {
    console.warn('WARN: 以下の行はどのフィールドにも取り込まれていません。元データかパーサの見直しが必要です:');
    for (const d of dropped) console.warn(`  - [${d.where}] ${d.line}`);
    // 警告は標準エラーに出るだけなので、非対話実行では見落とされる。saveSkillSheetBlocks は
    // legacy markdown ブロックを含まない finalBlocks で置き換えるため、取りこぼしたまま
    // 書き込むと元データが DB から消える。#151 D-7 はまさにこの経路（CodeRabbitレビュー指摘）。
    if (write && !allowDropped) {
      throw new Error(
        `取りこぼしが ${dropped.length} 行あります。このまま上書きすると元データが失われます。` +
          '元データかパーサを修正するか、承知の上で続行する場合は --allow-dropped を付けてください。',
      );
    }
  }

  const profileBlock: BlockInput | null = profile ? { type: 'profile', data: profile } : null;
  const skillsBlocks: BlockInput[] = skills.map((s) => ({ type: 'skills', data: s }));
  const projectBlock: BlockInput = { type: 'project', data: { companies, items } };
  const finalBlocks: BlockInput[] = [profileBlock, ...skillsBlocks, ...statsBlocks, projectBlock].filter(
    (b): b is BlockInput => b !== null,
  );

  writeFileSync('/tmp/migrated_profile_block.json', JSON.stringify(profile, null, 2));
  writeFileSync('/tmp/migrated_skills_blocks.json', JSON.stringify(skills, null, 2));
  writeFileSync('/tmp/migrated_project_block.json', JSON.stringify({ companies, items }, null, 2));
  console.log(
    'written /tmp/migrated_profile_block.json, /tmp/migrated_skills_blocks.json, /tmp/migrated_project_block.json',
  );

  if (!write) {
    console.log('DRY RUN — DB へは書き込んでいません（--write で実行すると保存します）');
    return;
  }

  const { saveSkillSheetBlocks } = await import('../src/skillsheet');
  await saveSkillSheetBlocks(SHEET_TITLE, finalBlocks, SHEET_ID);
  console.log('SAVED to sheetId', SHEET_ID);
}

// import.meta.url を直接実行チェックに使う。テストからこのモジュールを import した
// ときに main()（実DB接続・本番シートへの書き込み）が副作用として走らないようにする。
// `file://${process.argv[1]}` の文字列連結は Windows のパス区切りやスペース等で
// import.meta.url と一致しなくなるため、pathToFileURL で正規化を揃える
// （bootstrap-owner.ts と同じ方式）。
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
