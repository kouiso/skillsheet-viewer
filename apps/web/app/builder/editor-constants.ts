/**
 * 案件エディタのマスタ定数。
 *
 * claude.ai/design プロトタイプ（editor-store.js）のマスタを TypeScript へ移植したもの。
 * 選択肢はあくまで「サジェスト」であり、既存データに未知の値があっても壊さない
 * （select は現在値を先頭 option として温存、タグ入力は自由入力可）。
 */

import type { ProjectTech } from '@skillsheet/db/blocks';

/** 役割の選択肢（editor-store.js ROLE_OPTIONS 移植）。 */
export const ROLE_OPTIONS = [
  'フルスタック / EM',
  'バックエンドリード',
  'バックエンド',
  'フロントエンド',
  'SE',
  'PL',
  'PM',
  'PM & PL',
  'PMO',
  'SEサポート',
] as const;

/** 会社の種別タグの選択肢（editor-store.js COMPANY_KINDS 移植）。 */
export const KIND_OPTIONS = ['事業会社', 'SIベンダー', '業務委託', '受託', 'ベンチャー', '個人開発'] as const;

/** 技術スタックのカテゴリ（md の技術スタック表と同じ区分）。 */
export const TECH_CATEGORIES: { key: keyof ProjectTech; label: string }[] = [
  { key: 'lang', label: '使用言語' },
  { key: 'fw', label: 'フレームワーク・ライブラリ' },
  { key: 'db', label: 'データベース' },
  { key: 'infra', label: 'クラウド・インフラ' },
  { key: 'tools', label: '開発ツール' },
  { key: 'collab', label: 'コラボレーションツール' },
];

/** 技術スタックのサジェスト候補（カテゴリ別マスタ。入力済みの値は呼び出し側で合流させる）。 */
export const TECH_SUGGESTIONS: Record<keyof ProjectTech, string[]> = {
  lang: [
    'TypeScript',
    'JavaScript',
    'Python',
    'Go',
    'Java',
    'Kotlin',
    'Swift',
    'C#',
    'PHP',
    'Ruby',
    'Rust',
    'SQL',
    'HTML',
    'CSS',
    'SCSS',
    'HCL (Terraform)',
  ],
  fw: [
    'React',
    'Next.js',
    'React Native',
    'Expo',
    'Vue.js',
    'Nuxt',
    'NestJS',
    'Express',
    'FastAPI',
    'Django',
    'Ruby on Rails',
    'Spring Boot',
    'Laravel',
    'Tailwind CSS',
    'MUI',
    'Chakra UI',
    'shadcn/ui',
    'GraphQL',
    'Prisma',
    'TypeORM',
    'SQLAlchemy',
    'Redux Toolkit',
    'React Hook Form',
    'Zod',
    'SWR',
    'TanStack Query',
  ],
  db: [
    'PostgreSQL',
    'MySQL',
    'Aurora',
    'SQLite',
    'MongoDB',
    'Redis',
    'DynamoDB',
    'Firestore',
    'BigQuery',
    'OpenSearch',
    'Supabase',
  ],
  infra: [
    'AWS',
    'GCP',
    'Azure',
    'Firebase',
    'Cloudflare Workers',
    'Docker',
    'Kubernetes',
    'Terraform',
    'Vercel',
    'ECS Fargate',
    'AWS Lambda',
    'Cloud Run',
    'Stripe',
  ],
  tools: [
    'GitHub Actions',
    'Jest',
    'Vitest',
    'Playwright',
    'Cypress',
    'Pytest',
    'ESLint',
    'Biome',
    'Prettier',
    'Webpack',
    'Vite',
    'Turborepo',
    'Storybook',
    'Renovate',
    'Sentry',
    'Claude Code',
  ],
  collab: ['Slack', 'Notion', 'Figma', 'GitHub', 'Jira', 'Backlog', 'Redmine', 'Teams', 'Trello', 'Miro'],
};
