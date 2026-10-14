/**
 * Console方向のダッシュボードUI（プロフィール/統計/スキルマトリクス/工程の俯瞰/案件詳細/タイムライン）
 * を見た目確認するための検証用シートデータ・作成関数。
 *
 * 人物・会社・案件・経歴はすべて架空。実在の職務経歴書からは作っていない。
 * このリポジトリは public なので、実在の人物・会社・サービスを連想させる値を置かない。
 */

import type { BlockInput, CompanyInfo, ProjectItem, ProjectTech } from '../block';

// 再起動後の同じ作成操作でも、合成データ内の会社・案件IDを同一に保つ。
let fixtureId = 0;
const newId = () => `c0000000-0000-4000-8000-${(++fixtureId).toString(16).padStart(12, '0')}`;

const PROFILE = {
  name: '見本 花子（架空）',
  title: 'サンプルエンジニア / 見本リーダー',
  age: '架空',
  work: 'サンプル勤務',
  station: '例示駅',
  education: '見本',
  strengths: ['TypeScript', 'React', 'Next.js', 'PostgreSQL', 'Docker'],
  pr: 'この文章は表示確認用の架空の自己紹介です。実在の人物・経歴・会社とは関係ありません。',
};

const STATS = [
  { value: '6', unit: '年', label: '開発経験' },
  { value: '11', unit: '件', label: '参画プロジェクト' },
  { value: '9', unit: '名', label: '最大チーム規模' },
  { value: '6', unit: '/7', label: '担当工程' },
];

// スキル名は一般的な技術名。年数は架空。
const SKILLS: { cat: string; items: { name: string; years: number }[] }[] = [
  {
    cat: '言語',
    items: [
      { name: 'TypeScript / JavaScript', years: 8 },
      { name: 'HTML / CSS / SCSS', years: 6 },
      { name: 'Python', years: 3 },
      { name: 'Go', years: 1 },
    ],
  },
  {
    cat: 'フロントエンド',
    items: [
      { name: 'React', years: 5 },
      { name: 'Next.js', years: 3 },
      { name: 'Vue.js', years: 2 },
      { name: 'Tailwind CSS', years: 1 },
    ],
  },
  {
    cat: 'バックエンド',
    items: [
      { name: 'Node.js', years: 4 },
      { name: 'Express', years: 2 },
      { name: 'FastAPI', years: 1 },
    ],
  },
  {
    cat: 'データベース',
    items: [
      { name: 'PostgreSQL', years: 4 },
      { name: 'MySQL', years: 2 },
      { name: 'Redis', years: 1 },
    ],
  },
  {
    cat: 'インフラ',
    items: [
      { name: 'Docker', years: 4 },
      { name: 'AWS', years: 3 },
      { name: 'GitHub Actions', years: 2 },
    ],
  },
];

const COMPANIES = [
  '架空商事',
  '見本システム',
  '例示ラボ',
  'サンプル製作所',
  '仮想ソフト',
  'モック工房',
  '試作デザイン',
  '個人開発',
];

// [要件定義,基本設計,詳細設計,実装,結合テスト,総合テスト,保守運用]
const PROJECTS: {
  company: string;
  title: string;
  period: string;
  duration: string;
  role: string;
  team: number;
  tech: ProjectTech;
  process: number[];
}[] = [
  ['架空商事', '架空の在庫管理画面', '2025.04 — 継続中', '1年6ヶ月', '見本リーダー', 9],
  ['見本システム', '見本の予約受付システム', '2024.04 — 2025.03', '1年', 'サンプルエンジニア', 6],
  ['例示ラボ', '例示用の社内ポータル', '2023.07 — 2024.03', '9ヶ月', 'サンプルエンジニア', 5],
  ['サンプル製作所', 'サンプル決済フォーム', '2022.10 — 2023.06', '9ヶ月', '見本リーダー', 7],
  ['仮想ソフト', '架空の配送追跡アプリ', '2022.01 — 2022.09', '9ヶ月', 'サンプルエンジニア', 4],
  ['モック工房', '見本のアンケート集計', '2021.06 — 2021.12', '7ヶ月', 'サンプルエンジニア', 3],
  ['試作デザイン', '例示用のヘルプセンター', '2021.01 — 2021.05', '5ヶ月', 'サンプルエンジニア', 4],
  ['架空商事', 'サンプル勤怠ダッシュボード', '2020.04 — 2020.12', '9ヶ月', 'サンプルエンジニア', 5],
  ['見本システム', '架空の請求書発行ツール', '2019.10 — 2020.03', '6ヶ月', 'サンプルエンジニア', 3],
  ['例示ラボ', '見本の会員管理API', '2019.04 — 2019.09', '6ヶ月', 'サンプルエンジニア', 4],
  ['個人開発', '例示用の家計簿アプリ', '2018.10 — 2019.03', '6ヶ月', '個人開発', 1],
].map(([company, title, period, duration, role, team], i) => ({
  company: company as string,
  title: title as string,
  period: period as string,
  duration: duration as string,
  role: role as string,
  team: team as number,
  tech: {
    lang: ['TypeScript'],
    fw: i % 2 ? ['Next.js'] : ['React'],
    db: ['PostgreSQL'],
    infra: i % 3 ? ['Docker'] : ['AWS'],
    tools: ['GitHub'],
    collab: [],
  },
  process: [1, 1, 1, 1, 1, i % 2, i % 3 ? 1 : 0],
}));

function toBuilderProcess(flags: number[]): string[] {
  const out: string[] = [];
  if (flags[0]) out.push('要件定義');
  if (flags[1]) out.push('基本設計');
  if (flags[2]) out.push('詳細設計');
  if (flags[3]) out.push('実装');
  if (flags[4] || flags[5]) out.push('テスト');
  if (flags[6]) out.push('運用・保守');
  return out;
}

export function deriveLevel(years: number): string {
  if (years >= 5) return '上級';
  if (years >= 2) return '中級';
  return '初級';
}

const companies: CompanyInfo[] = COMPANIES.map((name) => ({ id: newId(), name, kind: '', period: '', note: '' }));
const companyIdByName = new Map(companies.map((c) => [c.name, c.id]));

const items: ProjectItem[] = PROJECTS.map((p) => ({
  id: newId(),
  companyId: companyIdByName.get(p.company) ?? '',
  title: p.title,
  scope: '架空の要件に基づくサンプル案件',
  period: p.period,
  role: p.role,
  team: `${p.team}名`,
  tech: p.tech,
  process: toBuilderProcess(p.process),
  duties: '',
  acquired: '',
  comment: '',
  summary: '表示確認のための架空の案件説明文です。実在の業務とは関係ありません。',
  duration: p.duration,
}));

const blockInputs: BlockInput[] = [
  {
    type: 'profile',
    data: {
      name: PROFILE.name,
      title: PROFILE.title,
      pr: PROFILE.pr,
      strengths: PROFILE.strengths,
      meta: { age: PROFILE.age, work: PROFILE.work, station: PROFILE.station, education: PROFILE.education },
    },
  },
  { type: 'stats', data: { items: STATS } },
  ...SKILLS.map((g) => ({
    type: 'skills' as const,
    data: {
      category: g.cat,
      skills: g.items.map((i) => ({ name: i.name, years: i.years, level: deriveLevel(i.years) })),
    },
  })),
  { type: 'project', data: { companies, items } },
];

export const CONSOLE_DEMO_TITLE = 'Console デザイン検証シート';

export function buildConsoleDemoBlocks(): BlockInput[] {
  return blockInputs;
}
