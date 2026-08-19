/**
 * Console方向のダッシュボードUI（プロフィール/統計/スキルマトリクス/工程の俯瞰/案件詳細/タイムライン）
 * を実データで見た目確認するための検証用シートデータ・作成関数。
 *
 * データはハンドオフ redesign2/data.js（skillsheet.md を正規化したもの＝ユーザー本人の実職務経歴書）
 * を ProjectBlockData 形式へマッピングしたもの。本番 Neon（DATABASE_URL）に
 * 新規シートとして INSERT する（既存シートは一切変更しない）。確認後は削除する想定。
 */

import type { BlockInput, CompanyInfo, ProjectItem, ProjectTech } from './blocks';
import { createSheet, listSheets } from './skillsheet';

const newId = () => crypto.randomUUID();

// --- ハンドオフ redesign2/data.js を土台にした検証用フィクスチャ -----------------------------
// このリポジトリは public なので、実在の会社名・サービス名・個人が特定できる属性は置かない。
// 正本（Neon）側と同じ匿名表記（Q 社 / A 社 …）に揃えることで、画面での見え方も本番と一致する。
const RAW_PROFILE = {
  name: '見本 花子（架空）',
  title: 'サンプルエンジニア / サンプルエンジニアリングマネージャー',
  age: '20代',
  work: 'フルリモート',
  station: '最寄駅（非公開）',
  education: '非公開',
  strengths: ['React', 'TypeScript', 'Nest.js', 'Ionic', 'Capacitor', 'Laravel', 'Terraform'],
  pr: '架空の案件説明文03。表示確認用のサンプルで、実在の業務とは関係ありません。',
};

const RAW_STATS = [
  { value: '8', unit: '年', label: '開発経験' },
  { value: '30', unit: '件', label: '参画プロジェクト' },
  { value: '18', unit: '名', label: '最大チーム規模' },
  { value: '7', unit: '/7', label: '担当工程（全工程）' },
];

const RAW_SKILLS: { cat: string; items: { name: string; years: number }[] }[] = [
  {
    cat: '言語',
    items: [
      { name: 'TypeScript / JavaScript', years: 8 },
      { name: 'HTML / CSS / SCSS', years: 7 },
      { name: 'Python', years: 4 },
      { name: 'PHP', years: 3 },
      { name: 'C#', years: 2 },
      { name: 'Kotlin / Swift', years: 1 },
    ],
  },
  {
    cat: 'フロントエンド',
    items: [
      { name: 'React', years: 6 },
      { name: 'Ionic / Capacitor', years: 3 },
      { name: 'Redux', years: 3 },
      { name: 'Next.js', years: 2 },
      { name: 'React Native / Expo', years: 1 },
      { name: 'Tailwind CSS', years: 1 },
    ],
  },
  {
    cat: 'バックエンド',
    items: [
      { name: 'Cloud Functions', years: 3 },
      { name: 'Laravel', years: 2 },
      { name: 'Django', years: 2 },
      { name: 'Nest.js', years: 1 },
      { name: 'FastAPI', years: 1 },
    ],
  },
  {
    cat: 'データベース',
    items: [
      { name: 'MySQL', years: 5 },
      { name: 'PostgreSQL', years: 4 },
      { name: 'Aurora', years: 4 },
      { name: 'Firestore', years: 3 },
      { name: 'Prisma', years: 1 },
    ],
  },
  {
    cat: 'インフラ',
    items: [
      { name: 'AWS', years: 4 },
      { name: 'GCP', years: 4 },
      { name: 'Docker', years: 2 },
      { name: 'Terraform', years: 1 },
      { name: 'Kubernetes', years: 1 },
    ],
  },
];

interface RawProject {
  title: string;
  scope: string;
  company: string;
  period: string;
  duration: string;
  role: string;
  team: number;
  tech: string[];
  process: number[]; // [要件定義,基本設計,詳細設計,実装,結合テスト,総合テスト,保守運用]
  summary: string;
}

const RAW_PROJECTS: RawProject[] = [
  {
    title: '架空案件10の開発',
    scope: 'iOS / Android / Web / バックエンド',
    company: 'Q 社（自社サービス事業会社）',
    period: '2025.11 — 現在',
    duration: '継続中',
    role: 'フルスタック / EM',
    team: 13,
    tech: [
      'TypeScript',
      'React Native',
      'Expo',
      'NestJS',
      'GraphQL',
      'Prisma',
      'Next.js',
      'AWS',
      'Terraform',
      'Firebase',
    ],
    process: [1, 1, 1, 1, 1, 1, 1],
    summary:
      '架空の案件説明文04。表示確認用のサンプルで、実在の業務とは関係ありません。',
  },
  {
    title: '架空案件09の開発',
    scope: 'Web / CMS / インフラ',
    company: 'Q 社（自社サービス事業会社）',
    period: '2025.12 — 現在',
    duration: '継続中',
    role: 'フルスタック / EM',
    team: 13,
    tech: [
      'TypeScript',
      'Next.js',
      'React',
      'Tailwind CSS',
      'Sanity',
      'Cloudflare Workers',
      'BigQuery',
      'Terraform',
      'GCP',
      'Playwright',
    ],
    process: [1, 1, 1, 1, 1, 1, 1],
    summary:
      '架空の案件説明文01。表示確認用のサンプルで、実在の業務とは関係ありません。',
  },
  {
    title: '架空案件07の開発',
    scope: '連合学習 + クラウド基盤',
    company: 'A社（大手SIベンダー）',
    period: '2025.08 — 2025.10',
    duration: '3ヶ月',
    role: 'バックエンドリード / インフラ',
    team: 5,
    tech: ['Python', 'TypeScript', 'FastAPI', 'SQLAlchemy', 'Aurora', 'ECS Fargate', 'Terraform', 'GitHub Actions'],
    process: [1, 1, 1, 1, 1, 1, 1],
    summary:
      '架空の案件説明文07。表示確認用のサンプルで、実在の業務とは関係ありません。',
  },
  {
    title: '架空案件05の開発',
    scope: 'バックエンド開発',
    company: 'A社（大手SIベンダー）',
    period: '2025.07 — 2025.09',
    duration: '3ヶ月',
    role: 'バックエンド',
    team: 5,
    tech: ['Python', 'FastAPI', 'AWS Lambda', 'Aurora', 'DynamoDB', 'Azure OpenAI', 'Terraform', 'SQS'],
    process: [1, 1, 1, 1, 1, 1, 0],
    summary:
      '架空の案件説明文02。表示確認用のサンプルで、実在の業務とは関係ありません。',
  },
  {
    title: '架空案件02の開発',
    scope: 'Web システム',
    company: 'A社（大手SIベンダー）',
    period: '2025.06 — 2025.07',
    duration: '2ヶ月',
    role: 'SE',
    team: 5,
    tech: ['TypeScript', 'Next.js', 'Prisma', 'NextAuth.js', 'PostgreSQL', 'AWS', 'Gemini API', 'Terraform'],
    process: [1, 1, 1, 1, 1, 0, 0],
    summary:
      '架空の案件説明文08。表示確認用のサンプルで、実在の業務とは関係ありません。',
  },
  {
    title: '架空案件04の開発',
    scope: 'AI基盤 / フルスタック',
    company: 'A社（大手SIベンダー）',
    period: '2025.01 — 2025.04',
    duration: '4ヶ月',
    role: 'SE',
    team: 12,
    tech: ['TypeScript', 'Python', 'Next.js', 'FastAPI', 'Radix UI', 'shadcn/ui', 'PostgreSQL', 'pgvector'],
    process: [1, 1, 1, 1, 1, 0, 0],
    summary:
      '架空の案件説明文12。表示確認用のサンプルで、実在の業務とは関係ありません。',
  },
  {
    title: '架空案件08の開発',
    scope: 'Web システム',
    company: 'C社',
    period: '2025.01 — 2025.02',
    duration: '2ヶ月',
    role: 'SE',
    team: 10,
    tech: ['TypeScript', 'NestJS', 'Next.js', 'TypeORM', 'Redux Toolkit', 'Tailwind CSS', 'MySQL', 'Redis', 'MongoDB'],
    process: [0, 0, 1, 1, 1, 0, 0],
    summary:
      '架空の案件説明文11。表示確認用のサンプルで、実在の業務とは関係ありません。',
  },
  {
    title: '架空案件12の開発',
    scope: 'フロント / バックエンド',
    company: 'D社',
    period: '2024.04 — 2024.12',
    duration: '9ヶ月',
    role: 'SE',
    team: 9,
    tech: ['TypeScript', 'Python', 'Next.js', 'Chakra UI', 'GraphQL', 'FastAPI', 'Aurora', 'Kubernetes', 'Hasura'],
    process: [1, 1, 1, 1, 1, 1, 0],
    summary:
      '架空の案件説明文09。表示確認用のサンプルで、実在の業務とは関係ありません。',
  },
  {
    title: '架空案件03の開発',
    scope: 'UI / フロント / バックエンド',
    company: 'E社',
    period: '2024.04 — 2024.07',
    duration: '4ヶ月',
    role: 'PL',
    team: 10,
    tech: ['TypeScript', 'React', 'Vite', 'NestJS', 'TypeORM', 'PostgreSQL', 'Stripe', 'Firebase'],
    process: [1, 1, 1, 1, 1, 1, 0],
    summary:
      '架空の案件説明文13。表示確認用のサンプルで、実在の業務とは関係ありません。',
  },
  {
    title: '架空案件01の開発',
    scope: 'CT/レントゲン画像ビューア',
    company: 'O社',
    period: '2021.07 — 2023.03',
    duration: '21ヶ月',
    role: 'PL',
    team: 18,
    tech: ['TypeScript', 'C#', 'React', 'Cornerstone', 'DICOM', 'Redux Toolkit', 'MUI', 'Aurora', 'AWS'],
    process: [0, 1, 1, 1, 1, 1, 1],
    summary:
      '架空の案件説明文06。表示確認用のサンプルで、実在の業務とは関係ありません。',
  },
  {
    title: '架空案件06の開発',
    scope: 'iOS / Android / Web',
    company: 'B社（ベンチャー）',
    period: '2020.06 — 2021.08',
    duration: '15ヶ月',
    role: 'PL',
    team: 12,
    tech: ['TypeScript', 'React', 'Ionic', 'Capacitor', 'Redux', 'MUI', 'Firebase', 'Stripe'],
    process: [1, 1, 1, 1, 1, 1, 1],
    summary:
      '架空の案件説明文05。表示確認用のサンプルで、実在の業務とは関係ありません。',
  },
  {
    title: '架空案件11の開発',
    scope: '個人開発 / クロスプラットフォーム',
    company: '個人開発',
    period: '2020.01 — 2021.02',
    duration: '14ヶ月',
    role: 'PM',
    team: 1,
    tech: ['TypeScript', 'Kotlin', 'Swift', 'Ionic', 'Capacitor', 'Firebase', 'GCP'],
    process: [1, 1, 1, 1, 1, 1, 1],
    summary:
      '架空の案件説明文10。表示確認用のサンプルで、実在の業務とは関係ありません。',
  },
];

// --- 変換 -------------------------------------------------------------------------------

const LANG = new Set(['TypeScript', 'JavaScript', 'Python', 'PHP', 'C#', 'Kotlin', 'Swift', 'HTML', 'CSS', 'SCSS']);
const FW = new Set([
  'React',
  'React Native',
  'Expo',
  'NestJS',
  'Next.js',
  'Vue',
  'Ionic',
  'Capacitor',
  'Redux',
  'Redux Toolkit',
  'FastAPI',
  'Django',
  'Laravel',
  'GraphQL',
  'Chakra UI',
  'Radix UI',
  'shadcn/ui',
  'Tailwind CSS',
  'MUI',
  'Cornerstone',
  'TypeORM',
  'SQLAlchemy',
  'Hasura',
  'Vite',
]);
const DB = new Set([
  'MySQL',
  'PostgreSQL',
  'Aurora',
  'Firestore',
  'Prisma',
  'DynamoDB',
  'MongoDB',
  'Redis',
  'pgvector',
]);
const INFRA = new Set([
  'AWS',
  'GCP',
  'Docker',
  'Terraform',
  'Kubernetes',
  'Cloudflare Workers',
  'ECS Fargate',
  'AWS Lambda',
  'Azure OpenAI',
  'Firebase',
  'BigQuery',
  'SQS',
  'Cognito',
]);

function bucketTech(list: string[]): ProjectTech {
  const tech: ProjectTech = { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] };
  for (const t of list) {
    if (LANG.has(t)) tech.lang.push(t);
    else if (FW.has(t)) tech.fw.push(t);
    else if (DB.has(t)) tech.db.push(t);
    else if (INFRA.has(t)) tech.infra.push(t);
    else tech.tools.push(t);
  }
  return tech;
}

// 7段([要件定義,基本設計,詳細設計,実装,結合テスト,総合テスト,保守運用])の集計フラグを、
// builder の実際の語彙(process.ts の EXACT_MATCH_MAP に完全一致する文字列)へ変換する。
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

// 会社名の初出順で CompanyInfo を作る（重複除去）。
const companyOrder: string[] = [];
for (const p of RAW_PROJECTS) {
  if (!companyOrder.includes(p.company)) companyOrder.push(p.company);
}
const companies: CompanyInfo[] = companyOrder.map((name) => ({
  id: newId(),
  name,
  kind: '',
  period: '',
  note: '',
}));
const companyIdByName = new Map(companies.map((c) => [c.name, c.id]));

const items: ProjectItem[] = RAW_PROJECTS.map((p) => ({
  id: newId(),
  companyId: companyIdByName.get(p.company) ?? '',
  title: p.title,
  scope: p.scope,
  period: p.period,
  role: p.role,
  team: `${p.team}名`,
  tech: bucketTech(p.tech),
  process: toBuilderProcess(p.process),
  duties: '',
  acquired: '',
  comment: '',
  summary: p.summary,
  duration: p.duration,
}));

const blockInputs: BlockInput[] = [
  {
    type: 'profile',
    data: {
      name: RAW_PROFILE.name,
      title: RAW_PROFILE.title,
      pr: RAW_PROFILE.pr,
      strengths: RAW_PROFILE.strengths,
      meta: {
        age: RAW_PROFILE.age,
        work: RAW_PROFILE.work,
        station: RAW_PROFILE.station,
        education: RAW_PROFILE.education,
      },
    },
  },
  {
    type: 'stats',
    data: { items: RAW_STATS },
  },
  ...RAW_SKILLS.map((g) => ({
    type: 'skills' as const,
    data: {
      category: g.cat,
      skills: g.items.map((i) => ({ name: i.name, years: i.years, level: deriveLevel(i.years) })),
    },
  })),
  {
    type: 'project',
    data: { companies, items },
  },
];

export const CONSOLE_DEMO_TITLE = 'Console デザイン検証シート';

export function buildConsoleDemoBlocks(): BlockInput[] {
  return blockInputs;
}

export async function createConsoleDemoSheet(): Promise<string> {
  const sheets = await listSheets();
  const existing = sheets.find((s) => s.title === CONSOLE_DEMO_TITLE);
  if (existing) return existing.id;
  return createSheet(CONSOLE_DEMO_TITLE, blockInputs);
}
