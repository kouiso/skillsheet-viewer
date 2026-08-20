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
import { pathToFileURL } from 'node:url';

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
import { loadScriptEnv } from './env';

const SHEET_TITLE = 'エンジニアスキルシート';

loadScriptEnv();

// loadScriptEnv() より後に評価する。SHEET_ID を先に定数化していると
// apps/web/.env.local 側の SHEET_ID 上書きが process.env へ反映される前に
// 読まれてしまい、無視される（レビュー指摘。--write時に誤ったシートを更新しうる）。
const SHEET_ID = process.env.SHEET_ID ?? '18a79e66-75e2-47e8-922e-d61342bb5233';

const newId = () => crypto.randomUUID();
// 各行を「まだ読まれていない」状態で保持し、パーサーが処理した行を消費済みにする。
// 最後に未消費の非空行を拾うことで、パーサー間の隙間や見落としを検出する（#227）。
type TrackedLine = { text: string; consumed: boolean };

class LineTracker {
  lines: TrackedLine[];

  constructor(text: string) {
    this.lines = text.split('\n').map((line) => ({ text: line, consumed: false }));
  }

  consume(i: number) {
    if (i >= 0 && i < this.lines.length) this.lines[i].consumed = true;
  }

  findIndex(predicate: RegExp, start = 0): number {
    for (let i = start; i < this.lines.length; i++) {
      if (predicate.test(this.lines[i].text)) return i;
    }
    return -1;
  }

  slice(start: number, end?: number): TrackedLine[] {
    return this.lines.slice(start, end ?? this.lines.length);
  }

  get length() {
    return this.lines.length;
  }
}

function collectUnconsumed(tracker: LineTracker, dropped: DroppedLine[], where: string): void {
  for (const line of tracker.lines) {
    if (line.consumed) continue;
    if (!line.text.trim()) continue;
    if (isTableSeparatorRow(line.text)) continue;
    pushDropped(dropped, where, line.text);
    line.consumed = true;
  }
}

// --- markdown テーブル行パース --------------------------------------------------------

// "| ラベル | 値 |" 形式の行から [ラベル, 値] を取り出す（区切り行 :--- は呼び出し側で除外）。
// 末尾パイプの有無にかかわらず正しくセルを取り出す（#227）。
function splitPipeRow(line: string): string[] {
  const parts = line.split('|');
  const firstEmpty = parts[0].trim() === '';
  const lastEmpty = parts[parts.length - 1].trim() === '';
  const start = firstEmpty ? 1 : 0;
  const end = lastEmpty ? parts.length - 1 : parts.length;
  return parts.slice(start, end).map((c) => c.trim());
}

// "| ラベル | 値 |" 形式の行から [ラベル, 値] を取り出す（区切り行は呼び出し側で除外）。
function parseTableRow(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;
  const cells = splitPipeRow(line);
  if (cells.length < 2) return null;
  const label = cells[0];
  if (/^:?-+:?$/.test(label)) return null;
  const value = cells.slice(1).join(' | ');
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
/** `|---|:---:|` のような表の区切り行。データではないため捨てても警告しない。 */
export function isTableSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
  const cells = trimmed.split('|').slice(1, -1);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

/** 空行と表の区切り行を除いた「本来データだったはずの行」だけを記録する。 */
function pushDropped(dropped: DroppedLine[], where: string, line: string): void {
  if (!line.trim()) return;
  if (isTableSeparatorRow(line)) return;
  dropped.push({ where, line: line.trim() });
}

// parseProjectBlock が実際に読むサブセクション。これ以外の見出しは誰も参照しないため、
// 中身が丸ごと失われる（例: `#### 備考`）。
const KNOWN_SUBSECTIONS = ['プロジェクト概要', '技術スタック', '担当工程', 'コメント'];

// main() が経歴セクションを切り出す起点。会社見出しより前に唯一存在してよい見出し。
// main() が経歴セクションを切り出す起点。会社見出しより前に唯一存在してよい見出し。
const CAREER_SECTION_HEADING = /^##\s*経歴(?:\s|$)/;

// セクションの正式名。構造行の判定は完全一致、セクション位置の探索は行内の部分一致で使う。
const SKILLS_SECTION_NAME = 'スキル・経験年数';
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
  // 部分一致にすると `<h3>スキル・経験年数の注意事項</h3>` まで構造行と誤判定して
  // 見逃す。既知のセクション名との完全一致に限る（Codexレビュー指摘）。
  return text === '' || text === SKILLS_SECTION_NAME;
}

// 担当工程表の先頭セル（行ラベル）として想定している値。これ以外は注記等が紛れている。
const PROCESS_ROW_LABELS = new Set(['工程', '経験']);

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
// --- 技術スタック行ラベル → ProjectTech バケット ----------------------------------------
const TECH_LABEL_MAP: Record<string, keyof ProjectTech> = {
  言語: 'lang',
  使用言語: 'lang',
  フレームワーク: 'fw',
  ライブラリ: 'fw',
  'フレームワーク・ライブラリ': 'fw',
  DB: 'db',
  データベース: 'db',
  クラウド: 'infra',
  インフラ: 'infra',
  'クラウド・インフラ': 'infra',
  外部サービス: 'tools',
  サービス: 'tools',
  開発ツール: 'tools',
  ツール: 'tools',
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

function parseProcessSection(lines: TrackedLine[], dropped: DroppedLine[] = [], where = ''): string[] {
  const at = `${where} の「担当工程」`;
  const rows: string[][] = [];
  const rowLines: TrackedLine[] = [];
  for (const line of lines) {
    line.consumed = true;
    const text = line.text;
    if (!text.trim()) continue;
    if (!text.trim().startsWith('|')) {
      pushDropped(dropped, `${at}（表の行ではない）`, text);
      continue;
    }
    const cells = splitPipeRow(text);
    if (cells.length === 0) {
      pushDropped(dropped, `${at}（表の行ではない）`, text);
      continue;
    }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    if (/^:?-+:?$/.test(cells[0])) {
      for (const c of cells) {
        if (c && !/^:?-+:?$/.test(c)) pushDropped(dropped, `${at}（区切り行に紛れた値）`, c);
      }
      continue;
    }
    rows.push(cells);
    rowLines.push(line);
  }

  if (rows.length < 2) {
    for (const line of rowLines) pushDropped(dropped, `${at}（ヘッダ行とデータ行が揃っていない）`, line.text);
    return [];
  }

  for (let i = 2; i < rows.length; i++) {
    pushDropped(dropped, `${at}（3行目以降は解釈されない）`, rowLines[i].text);
  }

  const header = rows[0];
  const data = rows[1];
  const result: string[] = [];
  for (const first of [header[0], data[0]]) {
    if (first && !PROCESS_ROW_LABELS.has(first)) {
      pushDropped(dropped, `${at}（想定外の行ラベル）`, first);
    }
  }
  for (let i = 1; i < header.length; i++) {
    const label = header[i];
    const idx = PROCESS_HEADER_ORDER.indexOf(label);
    if (idx === -1) {
      const unknownCell = (data[i] ?? '').trim();
      if (unknownCell) {
        pushDropped(
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
      const residue = cell.replace(/●/g, '').trim();
      if (residue) pushDropped(dropped, `${at}（●に付随する注記）`, `${label}: ${cell.trim()}`);
      continue;
    }
    const trimmed = cell.trim();
    if (trimmed && !PROCESS_NEGATIVE_MARKERS.has(trimmed)) {
      pushDropped(dropped, `${at}（解釈できないマーカー）`, `${label}: ${trimmed}`);
    }
  }
  for (let i = header.length; i < data.length; i++) {
    const extra = (data[i] ?? '').trim();
    if (extra) pushDropped(dropped, `${at}（ヘッダに対応する列が無い）`, extra);
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
  // 例: 案件21の "App Store から、サービス名で検索すると、赤いアプリが表示されます。"
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
// 会社の期間は原文のまま保持する（normalizePeriod を掛けない）。normalizePeriod は
// process.ts の item.period（"YYYY.M — YYYY.M" 形式）向けの変換で、会社の期間セルには
// 表示側の整形関数が無く原文表示のため通す必要が無い。むしろ単月表記（"2024年1月" のように
// 範囲区切りの "-" を含まない）は normalizeDateToken の単一トークン正規表現にそのまま
// マッチしてしまい "2024.1" に化けてしまう（他17社は範囲区切りが "〜" のため
// normalizeDateToken が非対応形式として素通しし、結果的に原文のまま残っていた）。
function parseCompanyHeading(text: string): { name: string; period: string } {
  const withoutMarker = text.replace(/^◆\s*/, '').trim();
  const idx = withoutMarker.lastIndexOf('-');
  if (idx === -1) return { name: withoutMarker, period: '' };
  const after = withoutMarker.slice(idx + 1).trim();
  const before = withoutMarker.slice(0, idx).trim();
  if (/年|現在/.test(after)) return { name: before, period: after };
  return { name: withoutMarker, period: '' };
}

// --- プロジェクト1件分（見出し行の次から次の ■ or ### まで）のパース -----------------------
function parseProjectBlock(
  headingLine: TrackedLine,
  bodyLines: TrackedLine[],
  companyId: string,
  dropped: DroppedLine[] = [],
): ProjectItem {
  headingLine.consumed = true;
  const headingText = headingLine.text.replace(/^####\s*/, '').trim();
  const { title, scope } = parseProjectHeading(headingText);
  const where = `案件「${title}」`;

  const sections: Record<string, { headingLine: TrackedLine; bodyLines: TrackedLine[] }> = Object.create(null);
  let current: string | null = null;
  const preHeading: TrackedLine[] = [];

  for (const line of bodyLines) {
    line.consumed = true;
    const m = line.text.match(/^####\s*(.+)$/);
    if (m) {
      const name = m[1].trim();
      if (current !== null && Object.hasOwn(sections, name)) {
        const prev = sections[name];
        pushDropped(dropped, `${where} の重複したサブセクション「${name}」`, prev.headingLine.text);
        for (const l of prev.bodyLines) pushDropped(dropped, `${where} の重複したサブセクション「${name}」`, l.text);
      }
      sections[name] = { headingLine: line, bodyLines: [] };
      current = name;
      continue;
    }
    if (current !== null) {
      sections[current].bodyLines.push(line);
    } else {
      preHeading.push(line);
    }
  }

  for (const line of preHeading) {
    pushDropped(dropped, `${where} の冒頭（サブセクション見出しより前）`, line.text);
  }

  let period = '';
  let role = '';
  let team = '';
  const overviewExtra: string[] = [];
  const tech = emptyTech();
  let process: string[] = [];
  let duties = '';
  let acquired = '';
  let comment = '';

  for (const [name, section] of Object.entries(sections)) {
    if (!KNOWN_SUBSECTIONS.includes(name)) {
      pushDropped(dropped, `${where} の未知のサブセクション「${name}」`, `#### ${name}`);
      for (const line of section.bodyLines)
        pushDropped(dropped, `${where} の未知のサブセクション「${name}」`, line.text);
      continue;
    }

    if (name === 'プロジェクト概要') {
      for (const line of section.bodyLines) {
        line.consumed = true;
        const row = parseTableRow(line.text);
        if (!row) {
          pushDropped(dropped, `${where} の「プロジェクト概要」（表の行として解釈できない）`, line.text);
          continue;
        }
        const [label, value] = row;
        if (label === '項目') continue;
        if (!value) continue;
        const overwriteGuard = (previous: string) => {
          if (previous)
            pushDropped(dropped, `${where} の「プロジェクト概要」（重複した項目の上書き）`, `${label}: ${previous}`);
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
        } else if (value) {
          overviewExtra.push(`${label}: ${stripBold(value)}`);
        }
      }
    } else if (name === '技術スタック') {
      for (const line of section.bodyLines) {
        line.consumed = true;
        const row = parseTableRow(line.text);
        if (!row) {
          pushDropped(dropped, `${where} の「技術スタック」（表の行として解釈できない）`, line.text);
          continue;
        }
        const [label, value] = row;
        const rawCells = splitPipeRow(line.text);
        if (rawCells.length > 2 && !isTableSeparatorRow(line.text)) {
          pushDropped(dropped, `${where} の「技術スタック」（列が2つを超える）`, line.text);
          continue;
        }
        if (label === '項目') continue;
        const bucket = TECH_LABEL_MAP[label];
        if (bucket === undefined) {
          pushDropped(dropped, `${where} の「技術スタック」（未知のラベル）`, line.text);
          continue;
        }
        tech[bucket].push(...splitTechValues(value));
      }
    } else if (name === '担当工程') {
      process = parseProcessSection(section.bodyLines, dropped, where);
    } else if (name === 'コメント') {
      const commentText = section.bodyLines.map((l) => l.text).join('\n');
      for (const line of section.bodyLines) line.consumed = true;
      const parsed = parseCommentSection(commentText);
      duties = parsed.duties;
      acquired = parsed.acquired;
      comment = parsed.comment;
    }
  }

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
function parseCareerSection(
  tracker: LineTracker,
  dropped: DroppedLine[],
): { companies: CompanyInfo[]; items: ProjectItem[] } {
  const companies: CompanyInfo[] = [];
  const items: ProjectItem[] = [];

  const careerStartIdx = tracker.findIndex(CAREER_SECTION_HEADING);
  if (careerStartIdx !== -1) tracker.consume(careerStartIdx);
  const section = tracker.slice(careerStartIdx !== -1 ? careerStartIdx + 1 : 0);

  let currentCompanyId: string | null = null;
  const currentCompanyIntro: TrackedLine[] = [];
  let currentProjectHeadingLine: TrackedLine | null = null;
  let currentProjectHeadingText = '';
  const currentProjectBody: TrackedLine[] = [];

  const flushProject = () => {
    if (currentProjectHeadingLine !== null && currentCompanyId !== null) {
      items.push(parseProjectBlock(currentProjectHeadingLine, currentProjectBody, currentCompanyId, dropped));
    } else if (currentProjectHeadingLine !== null) {
      pushDropped(dropped, '会社見出しより前の案件', currentProjectHeadingText);
      for (const line of currentProjectBody) pushDropped(dropped, '会社見出しより前の案件', line.text);
    }
    currentProjectHeadingLine = null;
    currentProjectHeadingText = '';
    currentProjectBody.length = 0;
  };

  const flushCompanyNote = () => {
    if (currentCompanyId !== null) {
      const prev = companies.find((c) => c.id === currentCompanyId);
      if (prev)
        prev.note = currentCompanyIntro
          .map((l) => l.text)
          .join('\n')
          .trim();
    }
    currentCompanyIntro.length = 0;
  };

  for (const line of section) {
    if (line.consumed) continue;
    line.consumed = true;

    const companyMatch = line.text.match(/^###(?!#)\s*(.+)$/);
    if (companyMatch) {
      flushProject();
      flushCompanyNote();
      const { name, period } = parseCompanyHeading(companyMatch[1]);
      const id = newId();
      companies.push({ id, name, kind: '', period, note: '' });
      currentCompanyId = id;
      continue;
    }

    const projectMatch = line.text.match(/^####\s*(■.+)$/);
    if (projectMatch) {
      flushProject();
      currentProjectHeadingLine = line;
      currentProjectHeadingText = projectMatch[1];
      continue;
    }

    if (currentProjectHeadingLine !== null) {
      currentProjectBody.push(line);
    } else if (currentCompanyId !== null) {
      currentCompanyIntro.push(line);
    } else if (!CAREER_SECTION_HEADING.test(line.text)) {
      pushDropped(dropped, '最初の会社見出しより前', line.text);
    }
  }

  flushProject();
  flushCompanyNote();

  return { companies, items };
}

export function parseCareerMarkdown(markdown: string): {
  companies: CompanyInfo[];
  items: ProjectItem[];
  dropped: DroppedLine[];
} {
  const tracker = new LineTracker(markdown);
  const dropped: DroppedLine[] = [];
  const { companies, items } = parseCareerSection(tracker, dropped);
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

function parseProfileSection(tracker: LineTracker, dropped: DroppedLine[]): ProfileBlockData | null {
  const startIdx = tracker.findIndex(/^##\s*技術者プロファイル(?:\s|$)/);
  if (startIdx === -1) return null;
  tracker.consume(startIdx);
  const at = '技術者プロファイル';

  let endIdx = tracker.length;
  for (let i = startIdx + 1; i < tracker.length; i++) {
    if (/^(?:#{2}\s|<details[\s>])/.test(tracker.lines[i].text)) {
      endIdx = i;
      break;
    }
  }
  const section = tracker.slice(startIdx + 1, endIdx);

  const prHeadingIdx = section.findIndex((line) => /^###\s*自己\s*PR/.test(line.text));
  const scanEnd = prHeadingIdx === -1 ? section.length : prHeadingIdx;

  const meta: ProfileMeta = {};
  let name = '';
  let company = '';
  const prLines: TrackedLine[] = [];

  for (const [i, line] of section.entries()) {
    if (line.consumed) continue;
    line.consumed = true;

    if (i === prHeadingIdx) continue;
    if (prHeadingIdx !== -1 && i > prHeadingIdx) {
      prLines.push(line);
      continue;
    }
    if (i >= scanEnd) continue;

    if (!line.text.startsWith('|')) {
      pushDropped(dropped, `${at}（表の行ではない）`, line.text);
      continue;
    }
    const row = parseTableRow(line.text);
    if (!row) {
      pushDropped(dropped, `${at}（表の行として解釈できない）`, line.text);
      continue;
    }
    const [rawLabel, value] = row;
    const label = normalizeProfileLabel(rawLabel);
    if (label === '項目') continue;
    if (!value) continue;
    if (!Object.hasOwn(PROFILE_LABEL_FIELDS, label)) {
      pushDropped(dropped, `${at}（対応する項目が無いラベル）`, `${rawLabel}: ${value}`);
      continue;
    }
    const field = PROFILE_LABEL_FIELDS[label];
    const previous = field === 'name' ? name : field === 'company' ? company : meta[field];
    if (previous) {
      pushDropped(dropped, `${at}（重複した項目の上書き）`, `${rawLabel}: ${previous}`);
    }
    if (field === 'name') name = value;
    else if (field === 'company') company = value;
    else meta[field] = value;
  }

  const pr = prLines
    .map((l) => l.text)
    .join('\n')
    .trim();

  if (!name && !company && Object.values(meta).every((v) => !v) && !pr) {
    return null;
  }

  return { name, title: '', pr, strengths: [], meta, company };
}

export function parseProfileMarkdown(markdown: string, dropped: DroppedLine[] = []): ProfileBlockData | null {
  const tracker = new LineTracker(markdown);
  return parseProfileSection(tracker, dropped);
}

function parseSkillsSection(tracker: LineTracker, dropped: DroppedLine[]): SkillsBlockData[] {
  let startIdx = tracker.findIndex(/^<details[\s>]/i);
  const hasDetails = startIdx !== -1;
  let endBoundaryIdx: number;

  if (hasDetails) {
    endBoundaryIdx = tracker.findIndex(/^<\/details>/i, startIdx + 1);
    if (endBoundaryIdx === -1) endBoundaryIdx = tracker.length;
  } else {
    startIdx = tracker.findIndex(/^##\s*スキル・経験年数(?:\s|$)/);
    if (startIdx === -1) return [];
    endBoundaryIdx = tracker.findIndex(/^##\s/, startIdx + 1);
    if (endBoundaryIdx === -1) endBoundaryIdx = tracker.length;
    tracker.consume(startIdx);
  }

  const section = hasDetails
    ? tracker.slice(startIdx, endBoundaryIdx + 1)
    : tracker.slice(startIdx + 1, endBoundaryIdx);
  const at = 'スキル・経験年数';

  const blocks: SkillsBlockData[] = [];
  let currentCategory = '';
  let currentCategoryLine: TrackedLine | null = null;
  let currentCategoryReport = false;
  const currentSkills: SkillEntry[] = [];

  const flushCategory = () => {
    if (!currentCategory) return;
    if (currentSkills.length > 0) {
      blocks.push({ category: currentCategory, skills: [...currentSkills] });
      return;
    }
    if (currentCategoryLine && currentCategoryReport) {
      pushDropped(dropped, `${at}（スキルが1件も無い技術分類）`, currentCategoryLine.text);
    }
  };

  for (const [_i, line] of section.entries()) {
    if (line.consumed) continue;
    line.consumed = true;

    if (isSkillsStructuralLine(line.text)) continue;

    if (HTML_WRAPPER_TAG.test(line.text.trim())) {
      const stripped = line.text.replace(/<[^>]*>/g, '').trim();
      if (stripped) pushDropped(dropped, `${at}（HTMLタグ内の想定外の内容）`, line.text);
      continue;
    }

    if (!line.text.startsWith('|')) {
      pushDropped(dropped, `${at}（表の行ではない）`, line.text);
      continue;
    }

    const cells = splitPipeRow(line.text);
    if (cells.length < 3) {
      pushDropped(dropped, `${at}（列が3つ未満）`, line.text);
      continue;
    }
    const first = stripBold(cells[0]);
    const skillName = stripBold(cells[1]);
    const yearsRaw = stripBold(cells[2]);
    if (first === '技術分類' || skillName === '技術名' || /^:?-+:?$/.test(first)) continue;

    for (const extra of cells.slice(3)) {
      if (extra.trim()) pushDropped(dropped, `${at}（4列目以降は読まれない）`, extra);
    }

    if (first) {
      flushCategory();
      currentCategory = first;
      currentCategoryLine = line;
      currentCategoryReport = true;
      currentSkills.length = 0;
    }
    if (!skillName) {
      if (yearsRaw) pushDropped(dropped, `${at}（技術名が無い）`, line.text);
      continue;
    }
    if (!currentCategory) {
      pushDropped(dropped, `${at}（技術分類が未確定）`, line.text);
      continue;
    }
    const yearsMatch = yearsRaw.match(/^(\d+(?:\.\d+)?)\s*年$/);
    if (yearsRaw && !yearsMatch) {
      pushDropped(dropped, `${at}（経験年数を解釈できない）`, `${skillName}: ${yearsRaw}`);
    }
    const years = yearsMatch ? Number(yearsMatch[1]) : 0;
    currentSkills.push({ name: skillName, years, level: deriveSkillLevel(years) });
  }
  flushCategory();

  return blocks;
}

export function parseSkillsMarkdown(markdown: string, dropped: DroppedLine[] = []): SkillsBlockData[] {
  const tracker = new LineTracker(markdown);
  return parseSkillsSection(tracker, dropped);
}

// --- メイン ---------------------------------------------------------------------------
export function parseRealSheetMarkdown(markdown: string): {
  profile: ProfileBlockData | null;
  skills: SkillsBlockData[];
  companies: CompanyInfo[];
  items: ProjectItem[];
  dropped: DroppedLine[];
} {
  const tracker = new LineTracker(markdown);
  const dropped: DroppedLine[] = [];
  const profile = parseProfileSection(tracker, dropped);
  const skills = parseSkillsSection(tracker, dropped);
  const { companies, items } = parseCareerSection(tracker, dropped);
  collectUnconsumed(tracker, dropped, 'どのセクションにも含まれない');
  return { profile, skills, companies, items, dropped };
}

async function main() {
  const write = process.argv.includes('--write');
  const allowDropped = process.argv.includes('--allow-dropped');

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
      skippedExistingProject = true;
    } else if (r.type === 'profile' || r.type === 'skills') {
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

  const { profile, skills, companies, items, dropped } = parseRealSheetMarkdown(fullMarkdown);

  console.log('PARSED_PROFILE:', profile ? 'yes' : 'no');
  console.log(
    'PARSED_SKILLS_CATEGORIES:',
    skills.length,
    'TOTAL_SKILLS:',
    skills.reduce((acc, s) => acc + s.skills.length, 0),
  );
  console.log('PARSED_COMPANIES:', companies.length);
  console.log('PARSED_PROJECTS:', items.length);

  console.log('DROPPED_LINES:', dropped.length);
  if (dropped.length > 0) {
    console.warn('WARN: 以下の行はどのフィールドにも取り込まれていません。元データかパーサの見直しが必要です:');
    for (const d of dropped) console.warn(`  - [${d.where}] ${d.line}`);
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
