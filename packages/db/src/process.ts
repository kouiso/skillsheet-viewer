/**
 * 案件ブロックの表示専用の工程正規化・付随ユーティリティ。
 *
 * builder が保存する `process: string[]` は自由記述10種の語彙（PROCESS_OPTIONS）のままで、
 * ここでは 7 段 SDLC モデルへの「表示用の集計軸」への変換のみを行う。データの発生源（builder）
 * とビューの集計軸（ここ）を分離するため、この変換結果は DB に保存しない。
 */

import type { ProjectTech } from './blocks';

/** 工程の俯瞰・ステッパーで使う表示専用の7段モデル。builderの選択肢とは語彙が異なる。 */
export const PROCESS_LABELS = [
  '要件定義',
  '基本設計',
  '詳細設計',
  '実装・単体',
  '結合テスト',
  '総合テスト',
  '保守・運用',
] as const;

interface ProcessMatch {
  index: number;
  /** true: done として扱う。false: uncertain（どちらの工程か本文だけでは判別不能）。 */
  certain: boolean;
}

// builder の実際の語彙（PROCESS_OPTIONS）からの完全一致対応表。
// fuzzy/部分一致/語順推測は一切行わない — 未知の文字列は全て other に落ちる。
const EXACT_MATCH_MAP: Record<string, ProcessMatch[]> = {
  要件定義: [{ index: 0, certain: true }],
  基本設計: [{ index: 1, certain: true }],
  詳細設計: [{ index: 2, certain: true }],
  実装: [{ index: 3, certain: true }],
  テスト: [
    { index: 4, certain: false },
    { index: 5, certain: false },
  ],
  // 「テスト」より細かい区分が判明している場合の完全一致エントリ（結合/総合を個別に確実扱いにする）。
  // builder の PROCESS_OPTIONS には無いが、実データ移行など上位で明示的にこの文字列を渡した場合のみ有効。
  結合テスト: [{ index: 4, certain: true }],
  総合テスト: [{ index: 5, certain: true }],
  '運用・保守': [{ index: 6, certain: true }],
};

export interface NormalizedProcess {
  /** 確実にその工程を担当した（7要素、PROCESS_LABELS と同じ並び）。 */
  done: boolean[];
  /** 担当したが具体的にどの段階か本文だけでは判別不能（7要素）。done と同時に true にはならない。 */
  uncertain: boolean[];
  /** 7段モデルの対象外（インフラ構築/PM/スクラム/コードレビュー/未知の自由記述）。データは消さない。 */
  other: string[];
}

/**
 * builder の自由文字列 process[] を、表示用の7段 done/uncertain/other へ変換する。
 * 完全一致のみで判定し、対応表にない文字列は全て other へ（実績を消さない）。
 */
export function normalizeProcess(labels: string[] = []): NormalizedProcess {
  const done = new Array(PROCESS_LABELS.length).fill(false) as boolean[];
  const uncertain = new Array(PROCESS_LABELS.length).fill(false) as boolean[];
  const other: string[] = [];

  for (const label of labels) {
    const matches = EXACT_MATCH_MAP[label];
    if (!matches) {
      other.push(label);
      continue;
    }
    for (const m of matches) {
      if (m.certain) done[m.index] = true;
      else uncertain[m.index] = true;
    }
  }

  return { done, uncertain, other };
}

// period 文字列を開始/終了トークンへ分割する区切り文字。
// 素の "-" は YYYY-MM 表記と衝突するため含めない（範囲表記は通常 em dash/〜/~ を使う）。
const RANGE_SEPARATORS = ['—', '〜', '~', '－'];

export function splitPeriodRange(period: string): [string, string] {
  if (typeof period !== 'string' || period.length === 0) return ['', ''];
  for (const sep of RANGE_SEPARATORS) {
    const idx = period.indexOf(sep);
    if (idx > -1) return [period.slice(0, idx).trim(), period.slice(idx + sep.length).trim()];
  }
  return [period.trim(), ''];
}

/** period が範囲区切り文字（〜 等）を含むか。単一トークン期間との判別に使う。 */
export function hasPeriodRangeSeparator(period: string): boolean {
  if (typeof period !== 'string' || period.length === 0) return false;
  return RANGE_SEPARATORS.some((sep) => period.includes(sep));
}

// YYYY-MM-DD / YYYY.MM / YYYY年M月 / YYYY-MM / YYYY の順で試す。すべて失敗したら null。
function parseYearMonth(token: string): number | null {
  if (!token) return null;
  let m = token.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return Number(m[1]) + (Number(m[2]) - 1) / 12;
  m = token.match(/^(\d{4})\.(\d{1,2})$/);
  if (m) return Number(m[1]) + (Number(m[2]) - 1) / 12;
  m = token.match(/^(\d{4})年(\d{1,2})月$/);
  if (m) return Number(m[1]) + (Number(m[2]) - 1) / 12;
  m = token.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return Number(m[1]) + (Number(m[2]) - 1) / 12;
  m = token.match(/^(\d{4})$/);
  if (m) return Number(m[1]);
  return null;
}

/**
 * 1トークン（開始 or 終了の片側）を月精度の表示形式（例: "2020.04"）へ整形する。
 * 解釈できないトークン（"現在"含む）はそのまま返す（データを壊さない）。
 */
export function formatMonthToken(rawToken: string): string {
  const token = typeof rawToken === 'string' ? rawToken.trim() : rawToken;
  if (!token) return token;
  if (/現在/.test(token)) return token;
  let m = token.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}.${m[2].padStart(2, '0')}`;
  m = token.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return `${m[1]}.${m[2].padStart(2, '0')}`;
  m = token.match(/^(\d{4})\.(\d{1,2})$/);
  if (m) return `${m[1]}.${m[2].padStart(2, '0')}`;
  return token;
}

/**
 * period 文字列（"開始〜終了" or 単独トークン）を月精度表示へ整形する。
 * 区切り文字が存在するのに終了トークンが空 = 進行中（現在）を意味する。
 */
export function formatPeriodDisplay(period: string): string {
  if (typeof period !== 'string' || period.length === 0) return period;
  const hasSeparator = RANGE_SEPARATORS.some((sep) => period.includes(sep));
  const [startToken, endToken] = splitPeriodRange(period);
  if (!startToken) return period;
  const start = formatMonthToken(startToken);
  if (!hasSeparator) return start;
  return `${start}〜${endToken ? formatMonthToken(endToken) : '現在'}`;
}

/** ISO日付文字列（YYYY-MM-DD）へシリアライズする（ピッカーの書き込み用）。 */
export function serializeDateToken(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/**
 * 1トークンを Date へ変換する（ピッカーの初期選択日の復元用）。
 * 月精度トークンは 1 日を補う。解釈不能なら undefined。
 */
export function parseTokenToDate(token: string): Date | undefined {
  if (!token || /現在/.test(token)) return undefined;
  let m = token.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m =
    token.match(/^(\d{4})\.(\d{1,2})$/) ??
    token.match(/^(\d{4})-(\d{1,2})$/) ??
    token.match(/^(\d{4})年(\d{1,2})月$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, 1);
  m = token.match(/^(\d{4})$/);
  if (m) return new Date(Number(m[1]), 0, 1);
  return undefined;
}

/**
 * period の開始年月をソートキー用の数値へ変換する（例: 2025.11 → 2025 + 10/12）。
 * 表記ゆれに対応しきれない場合は null を返す（呼び出し側は null を最古扱いにする）。
 */
export function parseStart(period: string): number | null {
  const [startToken] = splitPeriodRange(period);
  return parseYearMonth(startToken);
}

/** period の期間表現から表示用の duration 文字列を導出する（"現在" 終端は「継続中」）。 */
export function deriveDuration(period: string): string {
  const [startToken, endToken] = splitPeriodRange(period);
  if (!startToken) return '';
  if (!endToken || /現在/.test(endToken)) return '継続中';
  const start = parseYearMonth(startToken);
  const end = parseYearMonth(endToken);
  if (start === null || end === null) return '';
  const months = Math.round((end - start) * 12) + 1;
  if (months <= 0) return '';
  if (months < 12) return `${months}ヶ月`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  return remMonths === 0 ? `${years}年` : `${years}年${remMonths}ヶ月`;
}

const TECH_BUCKET_ORDER: (keyof ProjectTech)[] = ['lang', 'fw', 'db', 'infra', 'tools', 'collab'];

/** 6バケットの技術スタックを、初出順を保った重複なしのフラット配列にする。 */
export function flattenTech(tech: ProjectTech): string[] {
  if (!tech) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of TECH_BUCKET_ORDER) {
    for (const value of tech[key] ?? []) {
      if (!seen.has(value)) {
        seen.add(value);
        out.push(value);
      }
    }
  }
  return out;
}

/**
 * period から算出した start 降順（新しい順）でソートする。
 * start が null の項目は常に数値より古い扱いで末尾に置き、null 同士は元の配列順を保つ安定ソート。
 */
export function sortByStartDesc<T>(items: T[], getPeriod: (item: T) => string): T[] {
  return items
    .map((item, index) => ({ item, index, start: parseStart(getPeriod(item)) }))
    .sort((a, b) => {
      if (a.start === null && b.start === null) return a.index - b.index;
      if (a.start === null) return 1;
      if (b.start === null) return -1;
      return b.start - a.start;
    })
    .map((x) => x.item);
}
