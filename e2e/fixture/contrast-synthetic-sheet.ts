/**
 * #369 文字コントラスト証跡の撮影専用フィクスチャ。
 * 人物・会社・案件・経歴はすべて架空。実在の職務経歴書や既存フィクスチャ（console-demo.ts 等）からは作っていない。
 * 公開リポジトリの画像に載るため、実在の人物・会社を連想させる値を置かない。
 */
import type { BlockInput, CompanyInfo, ProjectItem } from '../../src/db/block';

export const CONTRAST_SYNTHETIC_TITLE = '架空サンプル（コントラスト証跡用）';
/** 本文描画の待機に使う、この架空シート固有のスキル名。 */
export const CONTRAST_SYNTHETIC_SKILL = 'SampleLang/Alpha';

let seq = 0;
const id = () => `5a000000-0000-4000-8000-${(++seq).toString(16).padStart(12, '0')}`;

const companies: CompanyInfo[] = ['架空商事（サンプル）', '見本システム', '例示ラボ'].map((name) => ({
  id: id(),
  name,
  kind: '',
  period: '',
  note: '',
}));

const projectTitles = [
  '架空の在庫管理画面',
  '見本の予約受付システム',
  '例示用の社内ポータル',
  'サンプル決済フォーム',
  '架空の配送追跡アプリ',
  '見本のアンケート集計',
  '例示用のヘルプセンター',
  'サンプル勤怠ダッシュボード',
];

const items: ProjectItem[] = projectTitles.map((title, i) => ({
  id: id(),
  companyId: companies[i % companies.length].id,
  title,
  scope: '架空の要件に基づくサンプル案件',
  period: `2020/${String((i % 12) + 1).padStart(2, '0')} - 2021/${String((i % 12) + 1).padStart(2, '0')}`,
  role: i % 2 ? 'サンプル開発者' : '見本リーダー',
  team: `${(i % 5) + 2}名`,
  tech: { lang: ['SampleLang'], fw: ['ExampleKit'], db: ['DemoDB'], infra: ['MockCloud'], tools: [], collab: [] },
  process: ['要件定義', '基本設計', '詳細設計', '実装', 'テスト'].slice(0, (i % 5) + 1),
  duties: '',
  acquired: '',
  comment: '',
  summary: 'コントラスト検証のための架空の案件説明文です。実在の業務とは関係ありません。',
  duration: '1年',
}));

const level = (years: number) => (years >= 5 ? '上級' : years >= 2 ? '中級' : '初級');
const skills = (category: string, list: [string, number][]): BlockInput => ({
  type: 'skills',
  data: { category, skills: list.map(([name, years]) => ({ name, years, level: level(years) })) },
});

export function buildContrastSyntheticBlocks(): BlockInput[] {
  return [
    {
      type: 'profile',
      data: {
        name: '見本 太郎（架空）',
        title: 'サンプルエンジニア',
        pr: 'この文章は表示確認用の架空の自己紹介です。実在の人物・経歴とは関係ありません。',
        strengths: ['SampleLang', 'ExampleKit', 'DemoDB', 'MockCloud'],
        meta: { age: '架空', work: 'サンプル', station: '例示駅', education: '見本' },
      },
    },
    {
      type: 'stats',
      data: {
        items: [
          { value: '3', unit: '年', label: '架空の経験' },
          { value: '8', unit: '件', label: 'サンプル案件' },
          { value: '6', unit: '名', label: '例示チーム' },
          { value: '5', unit: '/7', label: '見本工程' },
        ],
      },
    },
    skills('言語', [
      [CONTRAST_SYNTHETIC_SKILL, 6],
      ['SampleLang', 3],
    ]),
    skills('フレームワーク', [
      ['ExampleKit', 4],
      ['DemoWidgets', 1],
    ]),
    skills('データベース', [['DemoDB', 2]]),
    { type: 'project', data: { companies, items } },
  ];
}
