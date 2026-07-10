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
import { fileURLToPath } from 'node:url';

import type { BlockInput, CompanyInfo, ProjectItem, ProjectTech } from '../src/blocks';

const SHEET_ID = '18a79e66-75e2-47e8-922e-d61342bb5233';
const SHEET_TITLE = 'エンジニアスキルシート';

function loadWebEnvLocal(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '../../../apps/web/.env.local');
  if (!existsSync(envPath)) throw new Error(`apps/web/.env.local が見つかりません: ${envPath}`);
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

function parseProcessSection(lines: string[]): string[] {
  // ヘッダ行 "| 工程 | 要件定義 | ... |" とデータ行 "| 経験 | ● | ... |" を探す。
  const rows: string[][] = [];
  for (const line of lines) {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length === 0) continue;
    if (/^:?-+:?$/.test(cells[0])) continue;
    rows.push(cells);
  }
  if (rows.length < 2) return [];
  const header = rows[0];
  const data = rows[1];
  const result: string[] = [];
  for (let i = 1; i < header.length; i++) {
    const label = header[i];
    const idx = PROCESS_HEADER_ORDER.indexOf(label);
    if (idx === -1) continue;
    const cell = data[i] ?? '';
    if (cell.includes('●')) result.push(PROCESS_BUILDER_VOCAB[idx]);
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

  return {
    duties: sectionFor('≪担当業務≫'),
    acquired: sectionFor('≪習得スキル≫'),
    comment: sectionFor('≪コメント≫'),
  };
}

// --- プロジェクト見出し "■ (N.)? タイトル（スコープ）" のパース -------------------------------
function parseProjectHeading(text: string): { title: string; scope: string } {
  const withoutMarker = text.replace(/^■\s*/, '').trim();
  const withoutNumber = withoutMarker.replace(/^\d+\.\s*/, '').trim();
  const m = withoutNumber.match(/^(.*?)[\s]*[（(]([^）)]+)[）)]\s*$/);
  if (m) return { title: m[1].trim(), scope: m[2].trim() };
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
function parseProjectBlock(headingText: string, bodyLines: string[], companyId: string): ProjectItem {
  const { title, scope } = parseProjectHeading(headingText);

  // サブセクションごとに分割 (#### プロジェクト概要 / #### 技術スタック / #### 担当工程 / #### コメント)
  const sections: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of bodyLines) {
    const m = line.match(/^####\s*(.+)$/);
    if (m) {
      current = m[1].trim();
      sections[current] = [];
      continue;
    }
    if (current) sections[current].push(line);
  }

  let period = '';
  let role = '';
  let team = '';
  const overviewExtra: string[] = [];
  for (const line of sections.プロジェクト概要 ?? []) {
    const row = parseTableRow(line);
    if (!row) continue;
    const [label, value] = row;
    if (label === '期間') period = normalizePeriod(value);
    else if (label === '役割') role = stripBold(value);
    else if (label === 'チーム規模' || label === 'チーム') team = stripBold(value);
    else if (value) overviewExtra.push(`${label}: ${stripBold(value)}`);
  }

  const tech = emptyTech();
  for (const line of sections.技術スタック ?? []) {
    const row = parseTableRow(line);
    if (!row) continue;
    const [label, value] = row;
    if (label === '項目') continue; // ヘッダ行
    const bucket = TECH_LABEL_MAP[label] ?? 'tools';
    tech[bucket].push(...splitTechValues(value));
  }

  const process = parseProcessSection(sections.担当工程 ?? []);

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
function parseCareerMarkdown(markdown: string): { companies: CompanyInfo[]; items: ProjectItem[] } {
  const lines = markdown.split('\n');
  const companies: CompanyInfo[] = [];
  const items: ProjectItem[] = [];

  let currentCompanyId: string | null = null;
  let currentCompanyIntro: string[] = [];
  let currentProjectHeading: string | null = null;
  let currentProjectBody: string[] = [];

  const flushProject = () => {
    if (currentProjectHeading !== null && currentCompanyId !== null) {
      items.push(parseProjectBlock(currentProjectHeading, currentProjectBody, currentCompanyId));
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
    }
  }
  flushProject();
  if (currentCompanyId !== null) {
    const prev = companies.find((c) => c.id === currentCompanyId);
    if (prev) prev.note = currentCompanyIntro.join('\n').trim();
  }

  return { companies, items };
}

// --- メイン ---------------------------------------------------------------------------
async function main() {
  const write = process.argv.includes('--write');

  const { getDb } = await import('../src/client');
  const { blocks: blocksTable } = await import('../src/schema');
  const { eq, asc } = await import('drizzle-orm');
  const { isProfileBlockData, isStatsBlockData, isSkillsBlockData } = await import('../src/blocks');

  const db = getDb();
  const rows = await db
    .select()
    .from(blocksTable)
    .where(eq(blocksTable.sheetId, SHEET_ID))
    .orderBy(asc(blocksTable.order));

  const keepBlocks: BlockInput[] = [];
  const markdownParts: string[] = [];
  let skippedExistingProject = false;
  for (const r of rows) {
    if (r.type === 'profile' && isProfileBlockData(r.data)) keepBlocks.push({ type: 'profile', data: r.data });
    else if (r.type === 'stats' && isStatsBlockData(r.data)) keepBlocks.push({ type: 'stats', data: r.data });
    else if (r.type === 'skills' && isSkillsBlockData(r.data)) keepBlocks.push({ type: 'skills', data: r.data });
    else if (r.type === 'markdown') markdownParts.push((r.data as { markdown: string }).markdown);
    else if (r.type === 'project') {
      // 再実行（process.ts語彙修正の再適用等）を想定し、既存 project ブロックは
      // 再構築対象として無視する（元の legacy markdown からの再パースを正とする）。
      skippedExistingProject = true;
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
  const { companies, items } = parseCareerMarkdown(fullMarkdown);

  console.log('PARSED_COMPANIES:', companies.length);
  console.log('PARSED_PROJECTS:', items.length);

  const projectBlock: BlockInput = { type: 'project', data: { companies, items } };
  const finalBlocks: BlockInput[] = [...keepBlocks, projectBlock];

  writeFileSync('/tmp/migrated_project_block.json', JSON.stringify({ companies, items }, null, 2));
  console.log('written /tmp/migrated_project_block.json');

  if (!write) {
    console.log('DRY RUN — DB へは書き込んでいません（--write で実行すると保存します）');
    return;
  }

  const { saveSkillSheetBlocks } = await import('../src/skillsheet');
  await saveSkillSheetBlocks(SHEET_TITLE, finalBlocks, SHEET_ID);
  console.log('SAVED to sheetId', SHEET_ID);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
