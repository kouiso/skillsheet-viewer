/**
 * Console方向のダッシュボードUI（プロフィール/統計/スキルマトリクス/工程の俯瞰/案件詳細/タイムライン）
 * を実データで見た目確認するための検証用シートを1件 INSERT するスクリプト。
 *
 * データはハンドオフ redesign2/data.js（skillsheet.md を正規化したもの＝ユーザー本人の実職務経歴書）
 * を ProjectBlockData 形式へマッピングしたもの。本番 Neon（apps/web/.env.local の DATABASE_URL）に
 * 新規シートとして INSERT する（既存シートは一切変更しない）。確認後は削除する想定。
 *
 * 実行: pnpm --filter @skillsheet/db exec tsx packages/db/scripts/seed-console-demo.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BlockInput, CompanyInfo, ProjectItem, ProjectTech } from '../src/blocks';

// apps/web/.env.local から DATABASE_URL / SKILLSHEET_OWNER_ID を読み込む
// （packages/db には .env が無く、この2値は Web 側の .env.local にのみ存在するため）。
// createSheet() 呼び出し時（main 実行時）に getDb() が参照するので、import 自体は副作用を
// 持たず、この関数を main より先に呼べば間に合う。
function loadWebEnvLocal(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '../../../apps/web/.env.local');
  if (!existsSync(envPath)) {
    throw new Error(`apps/web/.env.local が見つかりません: ${envPath}`);
  }
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

const { createSheet } = await import('../src/skillsheet');

const newId = () => crypto.randomUUID();

// --- ハンドオフ redesign2/data.js の内容（そのまま転記） -----------------------------------
const RAW_PROFILE = {
  name: 'I・K',
  title: 'フルスタックエンジニア / エンジニアリングマネージャー',
  age: '28歳',
  work: 'フルリモート',
  station: '成田駅',
  education: '高卒',
  strengths: ['React', 'TypeScript', 'Nest.js', 'Ionic', 'Capacitor', 'Laravel', 'Terraform'],
  pr: 'フロントエンド・バックエンド・インフラまで一気通貫で担当可能。要件定義やPM/PLなど上流工程の経験も豊富で、AIエージェントを組み込んだ開発・レビュー基盤の構築も得意。新しい技術は必ず自分のPCで動かして確かめる性格。',
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
    title: 'マッチングアプリ「mypappy」',
    scope: 'iOS / Android / Web / バックエンド',
    company: '株式会社az',
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
      'モバイル・バックエンド・Web・管理画面の4リポジトリすべてに主要メンバーとして横断参画。チャット・本人確認(eKYC)・課金演出、通知基盤とN+1解消、CI/CD・AIレビュー基盤の構築までフルスタックで担当。',
  },
  {
    title: 'コンテンツメディア「Pink Labo」',
    scope: 'Web / CMS / インフラ',
    company: '株式会社az',
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
      '立ち上げ初期から参画し、アプリ開発・インフラ・開発基盤を一貫して担当。Terraformによる GCP インフラの単独構築、E2E・VRT・アクセシビリティを含む品質基盤、CSP・シークレット管理などセキュリティの作り込みを実施。',
  },
  {
    title: 'モバイル推薦システム開発',
    scope: '連合学習 + クラウド基盤',
    company: 'A社（大手SIベンダー）',
    period: '2025.08 — 2025.10',
    duration: '3ヶ月',
    role: 'バックエンドリード / インフラ',
    team: 5,
    tech: ['Python', 'TypeScript', 'FastAPI', 'SQLAlchemy', 'Aurora', 'ECS Fargate', 'Terraform', 'GitHub Actions'],
    process: [1, 1, 1, 1, 1, 1, 1],
    summary:
      'バックエンドAPI・連合学習基盤・CI/CD全体を設計実装。Lambda + Cognito 構成を FastAPI + Aurora へ移行し、月額運用コスト削減とレスポンスタイム改善を実現。',
  },
  {
    title: '不動産AI物件推薦システム',
    scope: 'バックエンド開発',
    company: 'A社（大手SIベンダー）',
    period: '2025.07 — 2025.09',
    duration: '3ヶ月',
    role: 'バックエンド',
    team: 5,
    tech: ['Python', 'FastAPI', 'AWS Lambda', 'Aurora', 'DynamoDB', 'Azure OpenAI', 'Terraform', 'SQS'],
    process: [1, 1, 1, 1, 1, 1, 0],
    summary:
      'Azure OpenAI と連携した物件推薦バックエンドをゼロから構築。API Gateway の30秒制限に対応するため同期処理を全面非同期化。IaC を徹底し、AWS Security Hub 基準100%準拠を達成。',
  },
  {
    title: '企業向けドキュメント管理・AI活用支援',
    scope: 'Web システム',
    company: 'A社（大手SIベンダー）',
    period: '2025.06 — 2025.07',
    duration: '2ヶ月',
    role: 'SE',
    team: 5,
    tech: ['TypeScript', 'Next.js', 'Prisma', 'NextAuth.js', 'PostgreSQL', 'AWS', 'Gemini API', 'Terraform'],
    process: [1, 1, 1, 1, 1, 0, 0],
    summary:
      'Gemini API を活用したドキュメント管理を開発。AWS認証が必須だった seed をモック化し環境構築を半日→数分に短縮。公開ストレージを署名付きURL方式へ移行しセキュリティを強化。',
  },
  {
    title: 'RPA自動化支援プラットフォーム',
    scope: 'AI基盤 / フルスタック',
    company: 'A社（大手SIベンダー）',
    period: '2025.01 — 2025.04',
    duration: '4ヶ月',
    role: 'SE',
    team: 12,
    tech: ['TypeScript', 'Python', 'Next.js', 'FastAPI', 'Radix UI', 'shadcn/ui', 'PostgreSQL', 'pgvector'],
    process: [1, 1, 1, 1, 1, 0, 0],
    summary:
      '既存XMLスクリプトを解析しテンプレート化する機能をフルスタックで設計実装。不要なバリデーション処理を特定し、最小限の修正で一覧の読み込み時間をほぼゼロに短縮。',
  },
  {
    title: 'ECポイント還元サービス',
    scope: 'Web システム',
    company: 'C社',
    period: '2025.01 — 2025.02',
    duration: '2ヶ月',
    role: 'SE',
    team: 10,
    tech: ['TypeScript', 'NestJS', 'Next.js', 'TypeORM', 'Redux Toolkit', 'Tailwind CSS', 'MySQL', 'Redis', 'MongoDB'],
    process: [0, 0, 1, 1, 1, 0, 0],
    summary:
      'モノレポ(Turbo)構成で管理画面・API・ブラウザ拡張を開発。画像アップロード時のクライアント側リアルタイム検証、障害初動を高速化する Slack 通知の拡充を実施。',
  },
  {
    title: '配達業務アプリの開発',
    scope: 'フロント / バックエンド',
    company: 'D社',
    period: '2024.04 — 2024.12',
    duration: '9ヶ月',
    role: 'SE',
    team: 9,
    tech: ['TypeScript', 'Python', 'Next.js', 'Chakra UI', 'GraphQL', 'FastAPI', 'Aurora', 'Kubernetes', 'Hasura'],
    process: [1, 1, 1, 1, 1, 1, 0],
    summary:
      'Next.js App Router のパフォーマンス最適化で約10秒のローディングを短縮。middleware 認証のキャッシュ化、PBI/SBI を取り入れたタスク管理の提案も実施。',
  },
  {
    title: 'book購入アプリのWebリプレイス',
    scope: 'UI / フロント / バックエンド',
    company: 'E社',
    period: '2024.04 — 2024.07',
    duration: '4ヶ月',
    role: 'PL',
    team: 10,
    tech: ['TypeScript', 'React', 'Vite', 'NestJS', 'TypeORM', 'PostgreSQL', 'Stripe', 'Firebase'],
    process: [1, 1, 1, 1, 1, 1, 0],
    summary:
      '既存スマホアプリの購入動線を Web 化。UI制作から一貫してフロント・バックを担当。スマホアプリのテーマを踏襲しつつ、機能の割に短期で構築することを実現。',
  },
  {
    title: '医療Webシステム（DICOM画像管理）',
    scope: 'CT/レントゲン画像ビューア',
    company: 'O社',
    period: '2021.07 — 2023.03',
    duration: '21ヶ月',
    role: 'PL',
    team: 18,
    tech: ['TypeScript', 'C#', 'React', 'Cornerstone', 'DICOM', 'Redux Toolkit', 'MUI', 'Aurora', 'AWS'],
    process: [0, 1, 1, 1, 1, 1, 1],
    summary:
      'リリースが5ヶ月遅延した状態から参入。Chromium を使い高精細DICOM画像を待機時間ゼロで表示するロジックを実装。Git Flow・自動デプロイなど提案技術の多くが採用され、面接も多数担当。',
  },
  {
    title: 'マッチングアプリ「PatentStart」',
    scope: 'iOS / Android / Web',
    company: 'B社（ベンチャー）',
    period: '2020.06 — 2021.08',
    duration: '15ヶ月',
    role: 'PL',
    team: 12,
    tech: ['TypeScript', 'React', 'Ionic', 'Capacitor', 'Redux', 'MUI', 'Firebase', 'Stripe'],
    process: [1, 1, 1, 1, 1, 1, 1],
    summary:
      'Ionic React のハイブリッドアプリ開発をベンチャーに提案し開発を主導。スマホ課金・Web決済を導入し、フロントで解決できない部分を Cloud Functions で実装。チーム向け講習会も開催。',
  },
  {
    title: 'HorseManager（馬匹健康管理）',
    scope: '個人開発 / クロスプラットフォーム',
    company: '個人開発',
    period: '2020.01 — 2021.02',
    duration: '14ヶ月',
    role: 'PM',
    team: 1,
    tech: ['TypeScript', 'Kotlin', 'Swift', 'Ionic', 'Capacitor', 'Firebase', 'GCP'],
    process: [1, 1, 1, 1, 1, 1, 1],
    summary:
      '企画・設計・実装・告知まで全て一人で担当。Ionic React で iOS/Android 両対応。位置情報やプッシュ通知を活用し、25種類の栄養価を算出するアルゴリズムを構築。',
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

function deriveLevel(years: number): string {
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

async function main() {
  const sheetId = await createSheet('Console デザイン検証シート', blockInputs);
  console.log('created sheetId:', sheetId);
  console.log(`URL: /view/db/${sheetId}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
