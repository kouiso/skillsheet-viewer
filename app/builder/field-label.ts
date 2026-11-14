import { type ProjectItem, type ProjectTech, resolveProfileMetaLabel } from '@/db/block';
import { TECH_CATEGORIES } from './editor-constant';

/**
 * 編集画面の項目名の対応表（唯一の置き場）。
 *
 * 編集画面（project-form.tsx）と、版の履歴の差分（version-diff.ts）の両方がここを読む。
 * 項目名を2か所に書くと、編集画面の語だけ直した時に差分が古い語のまま残り、
 * 「どの項目が変わったのか」を読み違える。語を変える時はここだけを直す。
 */

/** 案件フォームの項目名。キーは ProjectItem のキー。 */
export const PROJECT_FIELD_LABELS = {
  title: '案件タイトル',
  scope: 'スコープ / 担当領域',
  companyId: '所属会社',
  role: '役割',
  period: '期間',
  periodStart: '開始月',
  periodEnd: '終了月',
  ongoing: '継続中',
  team: 'チーム規模',
  process: '担当工程',
  duties: '担当業務',
  acquired: '習得スキル',
  comment: 'コメント',
  summary: '概要',
  duration: '期間の長さ',
  hidden: '閲覧側の表示',
} as const satisfies Partial<Record<keyof ProjectItem, string>>;

/** 会社バー（CompanyBar）の項目名。キーは CompanyInfo のキー。 */
export const COMPANY_FIELD_LABELS = {
  name: '会社名',
  kind: '会社の種別',
  period: '会社の期間',
  note: '会社の説明',
  hidden: '閲覧側の表示',
} as const;

/** 技術スタックの項目名。編集画面のカテゴリ定義（TECH_CATEGORIES）をそのまま引く。 */
export const TECH_FIELD_LABELS = Object.fromEntries(TECH_CATEGORIES.map((c) => [c.key, c.label])) as Record<
  keyof ProjectTech,
  string
>;

/** ブロックの種類名。アウトライン・パレット（canvas/palette.tsx）・差分の場所の先頭が同じ語を使う。 */
export const BLOCK_TYPE_LABELS: Record<string, string> = {
  markdown: 'テキスト',
  table: 'テーブル',
  skills: 'スキル',
  experience: '職務経歴（簡易）',
  profile: 'プロフィール',
  stats: '統計',
  project: '経歴（案件）',
};

export const MARKDOWN_FIELD_LABELS = { markdown: '本文' } as const;

export const SKILL_FIELD_LABELS = {
  category: 'スキルカテゴリ',
  name: '名称',
  years: '経験年数',
  level: '習熟度',
  featured: '推し',
} as const;

export const EXPERIENCE_FIELD_LABELS = {
  company: '会社名',
  startDate: '開始年月日',
  endDate: '終了年月日',
  role: '職種',
  description: '業務内容',
} as const;

export const PROFILE_FIELD_LABELS = {
  name: '名前',
  company: '所属会社',
  title: '肩書き',
  pr: '自己PR',
  strengths: '強み',
} as const;

export const STAT_FIELD_LABELS = {
  value: '数値',
  unit: '単位',
  label: 'ラベル',
  kind: '種類',
} as const;

export const TABLE_FIELD_LABELS = { label: '見出し', align: '列の揃え' } as const;

/** プロフィールの付随項目の項目名（既知キーは対応表、任意キーはキー自体が項目名）。 */
export const profileMetaLabel = resolveProfileMetaLabel;

/** 文書全体のタイトル。 */
export const DOCUMENT_TITLE_LABEL = 'タイトル';
