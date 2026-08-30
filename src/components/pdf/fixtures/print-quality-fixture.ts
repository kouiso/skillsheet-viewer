/**
 * PDF 品質検査（print-quality.ts）を CI で実データ無しに回すための、committed synthetic fixture。
 *
 * 実データ（骨経歴書の内容）は本番 Neon にしかなく、個人情報のためリポジトリへコミットできない。
 * かといって `REAL_BLOCKS_JSON` が無いと品質検査が CI で 1 度も実行されず
 * （`print-document.node.test.tsx` / `print-quality.node.test.tsx` の `skipIf`）、
 * 「品質ゲートは緑」という主張を裏付ける CI 上の証拠が無くなる。
 *
 * ここでは実データの中身は一切使わず、実データが持つ「構造上の形」だけを再現する:
 *  - 会社をまたぐページ跨ぎ（B社は 3 案件とも長文で、会社セクションが 3 ページ以上に及ぶ）
 *  - 詳細版（直近）と簡約版（それ以前）の両方
 *  - 長文・短文、必須フィールドの欠落（team / scope / process / acquired / comment 空）
 *  - 非常に長いタイトル、技術タグが PRINT_CHIP_LIMIT を超える案件（他 N 件の畳み込み）
 *  - スキル一覧が 2 ページに跨るだけの件数
 *
 * `resolveDetailLevels`（project-detail-level.ts）の分岐に日付の実行時依存が無いよう、
 * どの案件も period に「現在」を使わない（固定の終了年月にする）。`現在` を 1 件でも混ぜると、
 * baseline が実行時刻の `new Date()` になり、詳細/簡約の振り分けがテスト実行日によって
 * 変わってしまう（実測: DETAIL_CUTOFF_MONTHS=24 の境界に近い案件が数年後に振り分けを変える）。
 */

import type { Block, CompanyInfo, ProjectItem, ProjectTech } from '@/db/blocks';

const emptyTech = (): ProjectTech => ({ lang: [], fw: [], db: [], infra: [], tools: [], collab: [] });

/** duties / acquired / comment 用の長文を作る。同一文の単純反復だと箇条書き化した際に
 * 「同じ行が並ぶだけ」で読み手には不自然だが、品質検査（文字重なり・幅溢れ・空ページ）は
 * 内容の意味を見ないため、検証目的には十分。文をローテーションして単調な反復感だけ減らす。 */
function longParagraph(targetChars: number, seed: number): string {
  const sentences = [
    '要件定義から設計・実装・テストまでを一貫して担当し、関係者との合意形成を重視しながら進めた。',
    '既存システムの制約を踏まえた上で、段階的な移行計画を立て、影響範囲を最小化する方式を採った。',
    'パフォーマンス劣化が疑われる箇所を計測し、ボトルネックを特定した上でキャッシュ戦略を見直した。',
    '複数チームにまたがる調整が必要な場面では、定例の場を設けて認識のズレを早期に解消するよう努めた。',
    '障害発生時は原因調査から再発防止策の策定までを担当し、恒久対応をドキュメントに残した。',
    'コードレビューの観点を整理し、チーム全体の実装品質のばらつきを減らす取り組みを主導した。',
  ];
  const lines: string[] = [];
  let total = 0;
  let i = 0;
  while (total < targetChars) {
    const line = `・${sentences[(seed + i) % sentences.length]}`;
    lines.push(line);
    total += line.length + 1;
    i++;
  }
  return lines.join('\n');
}

function longComment(targetChars: number, seed: number): string {
  const sentences = [
    'この案件を通じて、技術的な意思決定を自分の言葉で説明できるようになったことが最大の収穫だった。',
    '短納期のプロジェクトだったが、優先順位を明確にすることでスコープを守りながら完遂できた。',
    '非機能要件（可用性・監視・運用手順）を後回しにせず初期段階から設計に組み込むようにした。',
    '振り返りでは、初期の見積もりが甘かった部分を次のプロジェクトの計画にフィードバックした。',
  ];
  const parts: string[] = [];
  let total = 0;
  let i = 0;
  while (total < targetChars) {
    const s = sentences[(seed + i) % sentences.length];
    parts.push(s);
    total += s.length;
    i++;
  }
  return parts.join('');
}

let idCounter = 0;
const nextId = (label: string) => `fx-${label}-${idCounter++}`;

function project(overrides: Partial<ProjectItem> & { companyId: string; title: string; period: string }): ProjectItem {
  return {
    id: nextId('project'),
    scope: '',
    role: '',
    team: '',
    tech: emptyTech(),
    process: [],
    duties: '',
    acquired: '',
    comment: '',
    ...overrides,
  };
}

// --- 会社 --------------------------------------------------------------

const COMPANY_A: CompanyInfo = {
  id: nextId('company'),
  name: 'V社（自社サービス事業会社）',
  kind: '',
  period: '',
  note: '直近は自社プロダクトの開発チームでバックエンドを担当。',
};
const COMPANY_B: CompanyInfo = { id: nextId('company'), name: 'W社（大手SIベンダー）', kind: '', period: '', note: '' };
const COMPANY_C: CompanyInfo = { id: nextId('company'), name: 'X社（受託開発）', kind: '', period: '', note: '' };
const COMPANY_D: CompanyInfo = { id: nextId('company'), name: 'Y社', kind: '', period: '', note: '' };
const COMPANY_E: CompanyInfo = { id: nextId('company'), name: 'Z社', kind: '', period: '', note: '' };
const COMPANY_F: CompanyInfo = { id: nextId('company'), name: '個人開発', kind: '', period: '', note: '' };
// 名前に区分をそのまま含む会社（companyLabelOf / kindLabel の重複排除分岐を通す）。
const COMPANY_G: CompanyInfo = { id: nextId('company'), name: '受託', kind: '受託', period: '', note: '' };
const COMPANY_H: CompanyInfo = { id: nextId('company'), name: 'U社', kind: '', period: '', note: '' };

const COMPANIES: CompanyInfo[] = [
  COMPANY_A,
  COMPANY_B,
  COMPANY_C,
  COMPANY_D,
  COMPANY_E,
  COMPANY_F,
  COMPANY_G,
  COMPANY_H,
];

// --- 案件 --------------------------------------------------------------
// 全案件の最新終了月（2026.06）が resolveDetailLevels の baseline になる。
// DETAIL_CUTOFF_MONTHS=24 なので 2024.06 以降に終わる案件は詳細版、それより前は簡約版
// （PL 以上の役割かつ 6 ヶ月以上の案件は例外的に詳細版へ昇格する）。

const items: ProjectItem[] = [
  // 会社 A: 直近・詳細版。非常に長いタイトルで折り返し・見出し帯の検査を通す。
  project({
    companyId: COMPANY_A.id,
    title:
      '大規模会員基盤における認証・認可基盤の刷新とマルチテナント対応バックエンドAPI群の設計・実装・段階移行プロジェクト',
    period: '2025.11 — 2026.06',
    role: 'バックエンドリード / エンジニアリングマネージャー',
    team: '9名',
    scope: 'バックエンド / インフラ',
    process: ['要件定義', '基本設計', '詳細設計', '実装', '結合テスト', '総合テスト', '運用・保守'],
    tech: {
      lang: ['TypeScript', 'Go'],
      fw: ['Next.js', 'NestJS'],
      db: ['PostgreSQL', 'Redis'],
      infra: ['AWS', 'Terraform'],
      tools: ['Datadog'],
      collab: ['Slack', 'Notion'],
    },
    duties: longParagraph(600, 1),
    acquired: longParagraph(400, 2),
    comment: longComment(300, 1),
  }),

  // 会社 B: 3 案件すべて直近・詳細版・長文。会社セクションが 3 ページ以上に及ぶことを狙う。
  project({
    companyId: COMPANY_B.id,
    title: '基幹システムのクラウドリプレイス（第一期）',
    period: '2025.01 — 2025.06',
    role: 'PL',
    team: '13名',
    scope: 'バックエンド / インフラ',
    process: ['要件定義', '基本設計', '詳細設計', '実装', '結合テスト'],
    tech: {
      lang: ['Java', 'Kotlin'],
      fw: ['Spring Boot'],
      db: ['Oracle', 'PostgreSQL'],
      infra: ['AWS', 'ECS'],
      tools: ['Jenkins'],
      collab: ['Jira', 'Confluence'],
    },
    duties: longParagraph(2200, 3),
    acquired: longParagraph(1200, 4),
    comment: longComment(1000, 2),
  }),
  project({
    companyId: COMPANY_B.id,
    title: '基幹システムのクラウドリプレイス（第二期・データ移行）',
    period: '2024.07 — 2024.12',
    role: 'PL',
    team: '10名',
    scope: 'バックエンド / データ移行',
    process: ['詳細設計', '実装', '結合テスト', '総合テスト'],
    tech: {
      lang: ['Java'],
      fw: ['Spring Batch'],
      db: ['Oracle', 'PostgreSQL'],
      infra: ['AWS'],
      tools: [],
      collab: ['Jira'],
    },
    duties: longParagraph(2000, 5),
    acquired: longParagraph(1100, 0),
    comment: longComment(900, 3),
  }),
  project({
    companyId: COMPANY_B.id,
    title: '基幹システムのクラウドリプレイス（第三期・安定化）',
    period: '2024.06 — 2024.08',
    role: 'SE',
    team: '6名',
    scope: '運用 / 監視基盤',
    process: ['総合テスト', '運用・保守'],
    tech: {
      lang: ['Java'],
      fw: [],
      db: ['PostgreSQL'],
      infra: ['AWS', 'Datadog'],
      tools: ['Datadog'],
      collab: [],
    },
    duties: longParagraph(1800, 1),
    acquired: longParagraph(900, 2),
    comment: longComment(700, 1),
  }),

  // 会社 C: 直近・詳細版（通常の分量）と、旧い・簡約版（短文 + 任意項目の欠落）。
  project({
    companyId: COMPANY_C.id,
    title: '中小企業向け会計SaaSの機能追加',
    period: '2025.03 — 2025.08',
    role: 'SE',
    team: '5名',
    scope: 'フロントエンド / バックエンド',
    process: ['基本設計', '実装', '結合テスト'],
    tech: {
      lang: ['TypeScript'],
      fw: ['React', 'Express'],
      db: ['MySQL'],
      infra: ['GCP'],
      tools: [],
      collab: ['Slack'],
    },
    duties: longParagraph(350, 6),
    acquired: longParagraph(250, 0),
    comment: longComment(200, 0),
  }),
  project({
    companyId: COMPANY_C.id,
    title: '社内ツールの保守',
    period: '2017.01 — 2017.02',
    role: 'SE',
    // team / scope / acquired / comment は未入力（任意項目の欠落を検証）。
    duties: '・既存の社内ツールの軽微な不具合修正と問い合わせ対応を行った。',
  }),

  // 会社 D: 旧いが PL 経験（6 ヶ月以上）なので規則 2 で詳細版へ昇格。技術タグを大量に積んで
  // PRINT_CHIP_LIMIT(6) を超える「他 N 件」の畳み込みを検証する。
  project({
    companyId: COMPANY_D.id,
    title: '大規模ECサイトのマイクロサービス化',
    period: '2015.04 — 2016.05',
    role: 'PM',
    team: '20名',
    scope: 'アーキテクチャ設計 / バックエンド',
    process: ['要件定義', '基本設計', '詳細設計', '実装'],
    tech: {
      lang: ['Java', 'Scala', 'Python', 'TypeScript', 'Go', 'Kotlin', 'Ruby', 'PHP', 'C#', 'Rust', 'Swift', 'Elixir'],
      fw: ['Spring Boot', 'Play Framework', 'Django', 'Express', 'Rails'],
      db: ['Oracle', 'PostgreSQL', 'MySQL', 'Redis', 'DynamoDB', 'Cassandra'],
      infra: ['AWS', 'Kubernetes', 'Docker', 'Terraform'],
      tools: ['Jenkins', 'Datadog', 'Sentry'],
      collab: ['Jira', 'Confluence', 'Slack'],
    },
    duties: longParagraph(500, 4),
    acquired: longParagraph(300, 5),
    comment: longComment(250, 2),
  }),

  // 会社 E: 旧い・非リード・短期間・必須級以外は全て空（簡約版の最小構成を検証）。
  project({
    companyId: COMPANY_E.id,
    title: '受託サイトの静的化対応',
    period: '2014.02 — 2014.03',
    duties: '・既存サイトを静的サイトジェネレータへ移行した。',
  }),
  project({
    companyId: COMPANY_E.id,
    title: '広告バナー配信ツールの改修',
    period: '2013.06 — 2013.07',
    comment: '短期の改修案件で、既存コードへの影響を抑えることを優先した。',
  }),

  // 会社 F（個人開発）: 旧い・簡約版・チーム欄が空（フリーランス相当）。
  project({
    companyId: COMPANY_F.id,
    title: '個人開発アプリのリリースと運用',
    period: '2019.04 — 2019.09',
    role: '個人開発者',
    scope: 'モバイルアプリ',
    tech: { lang: ['Swift'], fw: ['SwiftUI'], db: ['Firestore'], infra: ['Firebase'], tools: [], collab: [] },
    duties: longParagraph(300, 3),
    acquired: longParagraph(200, 1),
  }),

  // 会社 G（名前=区分「受託」）: 直近・詳細版。companyLabelOf の重複排除分岐を通す。
  project({
    companyId: COMPANY_G.id,
    title: '業務システムの新規開発',
    period: '2025.06 — 2025.12',
    role: 'SE',
    team: '4名',
    scope: 'バックエンド',
    process: ['基本設計', '実装', '結合テスト'],
    tech: { lang: ['PHP'], fw: ['Laravel'], db: ['MySQL'], infra: ['さくらVPS'], tools: [], collab: [] },
    duties: longParagraph(400, 2),
    acquired: longParagraph(250, 3),
    comment: longComment(200, 4),
  }),

  // 会社 H: 詳細版 1 件 + 簡約版 2 件を連続させ、簡約表がまとまって 1 つの表になることを検証する
  // （CompanySection の runs 結合ロジック）。
  project({
    companyId: COMPANY_H.id,
    title: '社内向け勤怠管理システムの刷新',
    period: '2025.09 — 2026.02',
    role: 'SE',
    team: '7名',
    scope: 'フルスタック',
    process: ['基本設計', '詳細設計', '実装', '結合テスト'],
    tech: {
      lang: ['TypeScript'],
      fw: ['Next.js'],
      db: ['PostgreSQL'],
      infra: ['Vercel'],
      tools: [],
      collab: ['Notion'],
    },
    duties: longParagraph(400, 5),
    acquired: longParagraph(250, 2),
    comment: longComment(200, 3),
  }),
  project({
    companyId: COMPANY_H.id,
    title: '旧勤怠システムの軽微改修（その1）',
    period: '2016.09 — 2016.10',
    role: 'SE',
    duties: '・打刻漏れ検知バッチの改修を行った。',
  }),
  project({
    companyId: COMPANY_H.id,
    title: '旧勤怠システムの軽微改修（その2）',
    period: '2016.05 — 2016.06',
    role: 'SE',
    duties: '・月次集計処理の不具合を修正した。',
  }),
];

// --- スキル一覧: 2 ページに跨るだけの件数 + 長めの自己紹介 -------------------

const SKILL_CATEGORIES: { category: string; names: string[] }[] = [
  {
    category: '言語',
    names: ['TypeScript', 'JavaScript', 'Python', 'Go', 'Java', 'Kotlin', 'Swift', 'Ruby', 'PHP', 'Rust'],
  },
  { category: 'フロントエンド', names: ['React', 'Next.js', 'Vue', 'Nuxt', 'Svelte', 'Redux', 'TanStack Query'] },
  { category: 'バックエンド', names: ['NestJS', 'Express', 'Spring Boot', 'Django', 'FastAPI', 'Rails', 'Laravel'] },
  { category: 'データベース', names: ['PostgreSQL', 'MySQL', 'Oracle', 'Redis', 'DynamoDB', 'MongoDB'] },
  { category: 'インフラ', names: ['AWS', 'GCP', 'Terraform', 'Kubernetes', 'Docker', 'Datadog', 'Vercel'] },
  { category: '開発ツール・その他', names: ['Git', 'GitHub Actions', 'Jenkins', 'Figma', 'Notion', 'Jira'] },
];

// --- ブロック組み立て ----------------------------------------------------

export const PDF_QUALITY_FIXTURE_TITLE = 'PDF品質検査 合成フィクスチャ';

export function buildPdfQualityFixtureBlocks(): Block[] {
  let order = 0;
  const blocks: Block[] = [
    {
      id: nextId('block'),
      order: order++,
      type: 'profile',
      data: {
        name: 'テスト 太郎',
        title: 'バックエンドエンジニア',
        company: 'V社（自社サービス事業会社）',
        pr: longParagraph(250, 0),
        strengths: ['バックエンド設計', 'チームリード'],
        meta: {
          age: '32歳',
          work: 'フルリモート可',
          station: '東京都内',
          education: '情報系専門学校卒',
          // 30 文字を超える値は summary ページの expertiseRows に回る分岐を通す。
          qualifications:
            '基本情報技術者、応用情報技術者、AWS認定ソリューションアーキテクト - アソシエイト、その他複数の技術系資格を保有',
        },
      },
    },
    {
      id: nextId('block'),
      order: order++,
      type: 'stats',
      data: {
        items: [
          { value: '11', unit: '年', label: '経験年数' },
          { value: '14', unit: '件', label: '案件数' },
          { value: '8', unit: '社', label: '取引社数' },
        ],
      },
    },
    ...SKILL_CATEGORIES.map((group) => ({
      id: nextId('block'),
      order: order++,
      type: 'skills' as const,
      data: {
        category: group.category,
        skills: group.names.map((name, i) => ({ name, years: (i % 7) + 1, level: i % 3 === 0 ? '上級' : '中級' })),
      },
    })),
    {
      id: nextId('block'),
      order: order++,
      type: 'project',
      data: { companies: COMPANIES, items },
    },
  ];
  return blocks;
}
