/**
 * 実データ相当のボリューム（19社 / 32案件）を持つ検証用シートデータ・作成関数。
 *
 * 背景（#143 / #153 X-2）:
 * 全画面デザイン監査（design-audit.spec.ts）は console-demo.ts の合成デモシート
 * （11案件・8社）を対象にしていたため、実データ（19社/32案件）でのみ発生する
 * 320px 幅での横スクロール（#143）を検出できなかった。#143 の実測では
 * 「Q 社（自社サービス事業会社） · 13 名 · 継続中」＋長い役割名
 * 「フルスタックエンジニア / エンジニアリングマネージャー」を持つ案件カードの
 * メタ列（`project-card.tsx` の `shrink-0` 列）がカード幅を押し広げ、
 * `scrollWidth`(361px) が `clientWidth`(320px) を超えていた。
 *
 * ここでは実データそのもの（機密な職務経歴書の内容）は埋め込まず、実データと
 * 同程度のボリューム・特徴（19社/32案件、長い会社名・役割名、多めの技術タグ数）
 * を持つ合成データを生成する。#143 の再現ケース（案件01 = 「マッチングアプリの開発」/
 * 役割「フルスタックエンジニア / エンジニアリングマネージャー」/ 会社
 * 「Q社（自社サービス事業会社）」/ チーム13名 / 継続中）はそのまま再現している。
 *
 * profile / stats / skills ブロックは console-demo.ts のものを流用し、project
 * ブロックのみをこのボリュームで差し替える。
 */

import type { BlockInput, CompanyInfo, ProjectItem, ProjectTech } from './blocks';
import { buildConsoleDemoBlocks } from './console-demo';
import { createSheet, listSheets } from './skillsheet';

const newId = () => crypto.randomUUID();

/** 元データ（実際の職務経歴書）の会社数。design-audit.spec.ts の件数一致チェックに使う。 */
export const REAL_VOLUME_COMPANY_COUNT = 19;
/** 元データ（実際の職務経歴書）の案件数。design-audit.spec.ts の件数一致チェックに使う。 */
export const REAL_VOLUME_PROJECT_COUNT = 32;

// 19社。実データと同様、自社サービス・大手SIベンダー・ベンチャー・受託・個人開発など
// 長さも種類もばらつく会社名にして、案件カードの右寄せメタ列（会社名 · チーム名 · 期間）の
// 崩れを再現しやすくする。
const COMPANY_NAMES: readonly string[] = [
  'Q社（自社サービス事業会社）',
  'A社（大手SIベンダー）',
  'B社（ベンチャー企業）',
  'C社',
  'D社',
  'E社',
  'F社',
  'G社',
  'H社',
  'I社',
  'J社（受託開発）',
  'K社',
  'L社',
  'M社',
  'N社',
  'O社',
  'P社（ベンチャー企業）',
  'R社（受託開発）',
  '個人開発',
];

const TITLE_TEMPLATES: readonly string[] = [
  'マッチングアプリの開発',
  '基幹システムのリプレイス',
  '社内向け業務システム開発',
  'ECサイトのフルリニューアル',
  'モバイルアプリ新規開発',
  '管理画面のUI/UX改善',
  'AI活用支援システムの構築',
  '決済基盤の刷新',
  'CMSの導入・移行',
  '検索基盤のパフォーマンス改善',
  '通知基盤の新規構築',
  'レポーティングダッシュボード開発',
];

const SCOPE_TEMPLATES: readonly string[] = [
  'iOS / Android / Web / バックエンド',
  'Web / バックエンド',
  'フロントエンド',
  'バックエンド',
  'インフラ / 基盤構築',
  'フルスタック',
];

// #143 の実測（長い役割名がカードの右寄せ列を押し広げる）を再現するため、
// 意図的に長い役割名を複数含める。
const ROLE_TEMPLATES: readonly string[] = [
  'フルスタックエンジニア / エンジニアリングマネージャー',
  'バックエンドリード / インフラ',
  'テックリード / スクラムマスター',
  'SE',
  'PL',
  'PM',
  'フロントエンドエンジニア',
  'バックエンドエンジニア',
];

const TECH_POOLS: readonly ProjectTech[] = [
  {
    lang: ['TypeScript', 'JavaScript'],
    fw: ['React', 'Next.js', 'NestJS'],
    db: ['PostgreSQL', 'Redis'],
    infra: ['AWS', 'Terraform', 'Docker'],
    tools: ['GitHub Actions'],
    collab: ['Slack'],
  },
  {
    lang: ['Python'],
    fw: ['FastAPI', 'Django'],
    db: ['Aurora', 'DynamoDB'],
    infra: ['AWS Lambda', 'ECS Fargate', 'Terraform'],
    tools: ['Datadog'],
    collab: ['Notion'],
  },
  {
    lang: ['TypeScript', 'Kotlin', 'Swift'],
    fw: ['React Native', 'Expo', 'Ionic', 'Capacitor'],
    db: ['Firestore', 'MySQL'],
    infra: ['Firebase', 'GCP'],
    tools: ['Sentry'],
    collab: ['Jira'],
  },
  {
    lang: ['TypeScript', 'PHP'],
    fw: ['Laravel', 'Vue', 'Nuxt'],
    db: ['MySQL', 'Redis', 'MongoDB'],
    infra: ['GCP', 'Cloudflare Workers', 'Kubernetes'],
    tools: ['BigQuery', 'Playwright'],
    collab: ['Slack', 'Notion'],
  },
];

const PROCESS_POOLS: readonly string[][] = [
  ['要件定義', '基本設計', '詳細設計', '実装', '結合テスト', '総合テスト', '運用・保守'],
  ['基本設計', '詳細設計', '実装', '結合テスト'],
  ['実装', '結合テスト', '総合テスト'],
  ['要件定義', '基本設計', '実装', '運用・保守'],
];

function buildCompanies(): CompanyInfo[] {
  return COMPANY_NAMES.map((name, i) => ({
    id: newId(),
    name,
    kind: '',
    period: i === 0 ? '2025.11 — 現在' : `${2018 + (i % 8)}.${(i % 12) + 1} — ${2018 + (i % 8)}.${((i + 3) % 12) + 1}`,
    note: '',
  }));
}

// 19社に対して 13社×2案件 + 6社×1案件 = 32案件になるよう配分する
// （REAL_VOLUME_COMPANY_COUNT / REAL_VOLUME_PROJECT_COUNT と整合させること）。
function buildItems(companies: CompanyInfo[]): ProjectItem[] {
  const items: ProjectItem[] = [];
  let idx = 0;
  for (let c = 0; c < companies.length; c++) {
    const projectsForCompany = c < 13 ? 2 : 1;
    for (let p = 0; p < projectsForCompany; p++) {
      const isFlagship = idx === 0; // 案件01: #143 実測の再現ケース
      const tech = TECH_POOLS[idx % TECH_POOLS.length];
      const titleTemplate = TITLE_TEMPLATES[idx % TITLE_TEMPLATES.length];
      items.push({
        id: newId(),
        companyId: companies[c].id,
        title: isFlagship ? 'マッチングアプリの開発' : titleTemplate,
        scope: SCOPE_TEMPLATES[idx % SCOPE_TEMPLATES.length],
        period: isFlagship
          ? '2025.11 — 現在'
          : `${2018 + (idx % 8)}.${(idx % 12) + 1} — ${2018 + (idx % 8)}.${((idx + 3) % 12) + 1}`,
        role: isFlagship
          ? 'フルスタックエンジニア / エンジニアリングマネージャー'
          : ROLE_TEMPLATES[idx % ROLE_TEMPLATES.length],
        team: isFlagship ? '13' : `${(idx % 15) + 1}`,
        tech,
        process: PROCESS_POOLS[idx % PROCESS_POOLS.length],
        duties: `・${titleTemplate}の設計・実装\n・関連システムとの連携調整`,
        acquired: '',
        comment: '',
        summary: `${companies[c].name}にて${titleTemplate}を担当。要件整理から実装・運用まで一気通貫で対応。`,
        duration: isFlagship ? '継続中' : `${(idx % 11) + 1}ヶ月`,
      });
      idx++;
    }
  }
  return items;
}

const companies = buildCompanies();
const items = buildItems(companies);

if (companies.length !== REAL_VOLUME_COMPANY_COUNT || items.length !== REAL_VOLUME_PROJECT_COUNT) {
  // フィクスチャの配分ロジックが REAL_VOLUME_* 定数とずれていたら、design-audit.spec.ts の
  // 件数一致チェックが常に失敗するため、モジュール読み込み時点で気づけるようにする。
  throw new Error(
    `real-volume-demo のフィクスチャ件数が定数と不一致です: companies=${companies.length} items=${items.length}`,
  );
}

const projectBlock: BlockInput = { type: 'project', data: { companies, items } };

export function buildRealVolumeDemoBlocks(): BlockInput[] {
  const nonProjectBlocks = buildConsoleDemoBlocks().filter((b) => b.type !== 'project');
  return [...nonProjectBlocks, projectBlock];
}

export const REAL_VOLUME_DEMO_TITLE = '実データボリューム検証シート（19社/32案件）';

// listSheets() での存在確認と createSheet() での作成は別操作のため、並行した E2E
// 実行が両方とも「未作成」と判定すると同名シートを複数作成しうる（レビュー指摘）。
// タイトルに一意制約は無く、スキーマ変更を伴う onConflict ガードは今回のスコープ外
// （本番DBスキーマ変更を伴う対応は対象外というユーザー指示、テスト用フィクスチャで
// あり本番データではないため）。
//
// 作成直後に再確認して重複があれば自分の分を削除する対症療法を一度試みたが、
// レビュー指摘により棄却した: updatedAt は一意でも単調でもなく、並行実行同士が
// それぞれ異なる行を「勝者」と判定しうる。互いに相手の行を削除すると、フィクスチャが
// 1件も残らない（元の「重複が残る」より悪い結果になる）。生半可な対症療法よりは、
// この既知の制約（低確率で重複が残りうる）を許容し、素朴な実装のままにする。
// 完全な解決には一意制約 + onConflictDoNothing() が必要で、それは第0段（本番DB
// スキーマ変更）の範囲になる。
export async function createRealVolumeDemoSheet(): Promise<string> {
  const sheets = await listSheets();
  const existing = sheets.find((s) => s.title === REAL_VOLUME_DEMO_TITLE);
  if (existing) return existing.id;
  return createSheet(REAL_VOLUME_DEMO_TITLE, buildRealVolumeDemoBlocks());
}
