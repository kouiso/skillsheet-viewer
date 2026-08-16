/**
 * project ブロックのデータ品質を直すスクリプト（#240 / #241）。3つのことをやる。
 *
 * 1. 空欄の `item.scope`（担当領域）を埋める
 * 2. 空欄の `company.kind`（会社区分）を埋める
 * 3. 実態と合っていない技術スタックの分類を付け替える
 *
 * #240 / #241 は上位2件だけを挙げているが、実際には案件32件の scope と会社19件の kind が
 * 全件空で、閲覧画面の担当領域タグと PDF の「会社区分」行がどこにも出ていなかった。
 *
 * 埋める値は捏造ではなく、同じシートに既に入っている `duties`（担当業務）と
 * `tech`（技術スタック）、および会社名の括弧書きから引いている。判断の根拠は
 * 下の表のコメントに残す。
 *
 * 冪等。既に値が入っている項目は上書きしない（人が後から直した値を潰さないため）。
 *
 * 実行:
 *   確認のみ: pnpm --filter @skillsheet/db exec tsx scripts/backfill-project-data.ts
 *   反映:     pnpm --filter @skillsheet/db exec tsx scripts/backfill-project-data.ts --apply
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';

import { isProjectBlockData, type ProjectTech } from '../src/blocks';
import { getDb } from '../src/client';
import { blocks } from '../src/schema';

// 会社名の括弧書き（例:「A 社（大手 SI ベンダー）」）と、note の「業務委託にて〜」という
// 書き出しから決まる。名前に情報が無く note も業務委託を明示していないものだけ個別に指定する。
const COMPANY_KIND_BY_NAME: Record<string, string> = {
  受託: '受託開発',
  個人開発: '個人開発',
};

// 担当領域。各案件の duties と tech から引いている。
// 例: 案件1 の duties は「iOS / Android アプリ（React Native + Expo）の機能開発」
//     「バックエンド（Nest.js + GraphQL + Prisma + AWS）」「会員向け Web・キャンペーン LP」
//     「管理画面（admin）の立ち上げ、CI/CD・レビュー基盤の整備」なので下記の4領域になる。
const SCOPE_BY_TITLE: Record<string, string> = {
  マッチングアプリの開発: 'iOS / Android / Web / バックエンド / 開発基盤',
  コンテンツメディアの開発: 'Web / CMS / インフラ / 開発基盤',
  'モバイル推薦システム開発（連合学習 + クラウド基盤）': 'バックエンド / インフラ / CI・CD',
  '不動産業界向け AI 物件推薦システム バックエンド開発': 'バックエンド / インフラ',
  '企業向けドキュメント管理・AI 活用支援システム': 'Web / バックエンド / 開発環境',
  業務自動化システムの開発: 'バックエンド / LLM 連携 / CI・CD',
  'RPA 自動化支援プラットフォームの開発': 'Web / バックエンド / AI 基盤',
  'EC ポイント還元サービスの Web システム': '管理画面 / バックエンド / ブラウザ拡張',
  配達業務アプリの開発: 'Web / バックエンド',
  '3D メディア販売向けのポートフォリオサイトの構築': 'Web / バックエンド / インフラ',
  'book 購入アプリの web へのリプレイス化': 'Web / バックエンド',
  環境ポイントアプリの開発: 'Web / バックエンド',
  // duties が「要件定義、詳細設計、進捗管理、一部実装、技術選定」なので上流込み。
  不動産ポイントサイトの開発: '要件定義 / 設計 / 進捗管理 / Web',
  高槻市スマホアプリの修正作業: 'iOS / Android',
  '小売の Web サイト UnivaPay での決済機能の実装': 'Web / 決済連携 / 設計・タスク管理',
  '自動車監査の WEB システム': 'Web / バックエンド / 設計・タスク管理',
  'SES システムの開発': 'Web / バックエンド',
  雑誌などの販売システム: 'Web / バックエンド',
  英語教材のスマホアプリ: '進捗・コスト管理 / 要件定義 / iOS / Android',
  '医療 Web システム CT やレントゲン画像を管理する': 'Web / メンバーアサイン・採用',
  '弁理士と特許申請希望者をつなぐマッチングアプリ【PatentStart】': 'iOS / Android / メンバーアサイン',
  運転手のアルコール検査システム: 'バックエンド',
  'Jewels ～お問い合わせフォームの修正～': 'Web / 顧客折衝',
  'Jacpa ホームページ作成': 'Web（HTML / SCSS コーディング）',
  'Lbranding ホームページ作成': '管理画面（HTML / SCSS コーディング）',
  '盾の勇者 ～ Google Sheet にフォームからの問い合わせを記録～': 'Web / 外部 API 連携',
  'Rcleaning ～予約受付フォームの構築～': 'Web（フォーム改修）',
  ランディングページからの自動予約申し込み受付: 'Web / 外部 API 連携 / 告知・宣伝',
  ジムの会員予約サイト: 'バックエンド',
  "T's STABLE ～ Web ページ制作～": 'Web / 営業・ディレクション',
  'HorseManager ～馬匹の健康管理システム～ 第二弾': '企画 / 設計 / iOS / Android / Web',
  'HorseFeeders ～馬匹の飼料管理システム～ 第一弾': '企画 / Web / バックエンド / 告知・宣伝',
};

// 技術スタックの分類が実態と合っていないもの（#240 / #241）。
// 課金 SDK・決済サービス・分析タグはフレームワークでもコラボレーションツールでもないので、
// 読み手が「何を使えるのか」を誤解しないよう tools へ寄せる。
// キーは技術名の前方一致で見る（`RevenueCat (SDK)` のような表記ゆれを拾うため）。
const TECH_BUCKET_OVERRIDE: { prefix: string; bucket: TechBucket }[] = [
  { prefix: 'RevenueCat', bucket: 'tools' },
  { prefix: 'UnivaPay', bucket: 'tools' },
  { prefix: 'DOMPurify', bucket: 'tools' },
  { prefix: 'Microsoft Clarity', bucket: 'tools' },
  { prefix: 'GTM', bucket: 'tools' },
  { prefix: 'Google Tag Manager', bucket: 'tools' },
];

type TechBucket = keyof ProjectTech;

const TECH_BUCKETS: TechBucket[] = ['lang', 'fw', 'db', 'infra', 'tools', 'collab'];

function targetBucket(tech: string): TechBucket | null {
  const normalized = tech.trim();
  return TECH_BUCKET_OVERRIDE.find((rule) => normalized.startsWith(rule.prefix))?.bucket ?? null;
}

// 分類の付け替え。同じ技術が移動先に既にあれば重複させず落とす。
function recategoriseTech(tech: ProjectTech, onMove: (name: string, from: TechBucket, to: TechBucket) => void) {
  const next: ProjectTech = { ...tech };
  for (const bucket of TECH_BUCKETS) {
    next[bucket] = [...(tech[bucket] ?? [])];
  }
  for (const from of TECH_BUCKETS) {
    for (const name of [...next[from]]) {
      const to = targetBucket(name);
      if (!to || to === from) continue;
      next[from] = next[from].filter((t) => t !== name);
      if (!next[to].includes(name)) next[to].push(name);
      onMove(name, from, to);
    }
  }
  return next;
}

// 会社名の括弧書きから区分を取り出す。「A 社（大手 SI ベンダー）」→「大手 SI ベンダー」。
function kindFromCompanyName(name: string): string | null {
  const matched = name.match(/（(.+)）\s*$/);
  return matched ? matched[1].trim() : null;
}

// note の書き出しが「業務委託にて」なら業務委託。会社名に括弧書きが無い C 社〜O 社がこれに当たる。
function kindFromNote(note: string): string | null {
  return note.trimStart().startsWith('業務委託') ? '業務委託' : null;
}

function resolveKind(name: string, note: string): string | null {
  return COMPANY_KIND_BY_NAME[name.trim()] ?? kindFromCompanyName(name) ?? kindFromNote(note);
}

function loadWebEnvLocal(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '../../../apps/web/.env.local');
  if (!existsSync(envPath)) {
    throw new Error(`apps/web/.env.local が見つかりません: ${envPath}`);
  }
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
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

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const db = getDb();
  const rows = await db.select().from(blocks).where(eq(blocks.type, 'project'));

  let companiesFilled = 0;
  let companiesSkipped = 0;
  let itemsFilled = 0;
  let itemsUnmapped = 0;
  let techMoved = 0;

  for (const row of rows) {
    if (!isProjectBlockData(row.data)) {
      console.warn(`skip: project ブロックとして解釈できない data (block ${row.id})`);
      continue;
    }
    const data = row.data;

    const companies = data.companies.map((company) => {
      if (company.kind?.trim()) {
        companiesSkipped += 1;
        return company;
      }
      const kind = resolveKind(company.name, company.note ?? '');
      if (!kind) {
        console.warn(`  会社区分を決められませんでした: ${company.name}`);
        return company;
      }
      companiesFilled += 1;
      console.log(`  会社区分 ${company.name} → ${kind}`);
      return { ...company, kind };
    });

    const items = data.items.map((item) => {
      const tech = recategoriseTech(item.tech, (name, from, to) => {
        techMoved += 1;
        console.log(`  技術分類 ${item.title}: ${name} を ${from} → ${to}`);
      });

      if (item.scope?.trim()) return { ...item, tech };
      const scope = SCOPE_BY_TITLE[item.title.trim()];
      if (!scope) {
        itemsUnmapped += 1;
        console.warn(`  担当領域の対応表にありません: ${item.title}`);
        return { ...item, tech };
      }
      itemsFilled += 1;
      console.log(`  担当領域 ${item.title} → ${scope}`);
      return { ...item, scope, tech };
    });

    if (apply) {
      await db
        .update(blocks)
        .set({ data: { ...data, companies, items } })
        .where(eq(blocks.id, row.id));
    }
  }

  console.log('');
  console.log(`会社区分:   ${companiesFilled} 件を補完 / ${companiesSkipped} 件は入力済みのため据え置き`);
  console.log(`担当領域:   ${itemsFilled} 件を補完 / ${itemsUnmapped} 件は対応表に無く未補完`);
  console.log(`技術分類:   ${techMoved} 件を付け替え`);
  console.log(apply ? '→ DB へ反映しました。' : '→ 確認のみ（反映するには --apply を付ける）。');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
