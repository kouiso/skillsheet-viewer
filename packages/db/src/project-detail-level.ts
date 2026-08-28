/**
 * 案件を「詳細版（C）」と「簡約版（D）」に振り分ける表示専用のロジック。
 *
 * PDF は 32 案件を同じ分量・同じ見た目で並べていて、直近の案件も 8 年前の小規模案件も
 * 区別が付かない。読み手（エージェントは 30 秒、発注企業の PM は 2 分）が「直近で何を
 * どこまでやったか」を先に受け取れるよう、直近と主要実績だけを詳細版で出す。
 *
 * 判定材料は `period` 文字列だけ。`periodStart` / `periodEnd` / `ongoing` は実データで
 * 全件空なので使えない（DB 実測）。この結果は DB に保存しない — 表示のための集計軸である。
 */

import type { ProjectItem } from './blocks';
import { parsePeriodBounds } from './process';

/** 詳細版にする「直近」の幅（ヶ月）。 */
export const DETAIL_CUTOFF_MONTHS = 24;

/** 規則 2（古いが主要な実績）で詳細版に上げる下限の期間（ヶ月）。 */
export const SENIOR_MIN_MONTHS = 6;

/** 規則 2 で詳細版に上げる件数の上限。ここを増やすと「直近を先に読ませる」狙いが薄れる。 */
export const SENIOR_MAX_COUNT = 3;

export type DetailLevel = 'detail' | 'compact';

/**
 * 役割文字列が「PL 以上」か。
 *
 * 実データの role は自由記述で、`PL` / `PM & PL` / `PM, PL` / `PMO→PL` / `SE` /
 * `バックエンドリード・インフラエンジニア` / `フルスタックエンジニア / エンジニアリングマネージャー`
 * のように揺れている。部分一致で拾うが、拾う語彙は「そのプロジェクトを率いていた」と
 * 読める語だけに限る（`SE` / `SE サポート` は拾わない）。
 */
const LEAD_ROLE_TOKENS = ['PL', 'PM', 'PMO', 'リード', 'マネージャー', 'マネジメント', 'EM'] as const;

export function isLeadRole(role: string): boolean {
  if (typeof role !== 'string') return false;
  const normalized = role.toUpperCase();
  return LEAD_ROLE_TOKENS.some((token) => normalized.includes(token.toUpperCase()));
}

/** period から稼働月数を返す（両端を含む）。解釈できなければ null。 */
export function periodMonths(period: string): number | null {
  const bounds = parsePeriodBounds(period);
  if (!bounds) return null;
  return Math.round((bounds.end - bounds.start) * 12) + 1;
}

/**
 * 「直近」の基準になる年月（parsePeriodBounds と同じ数値尺度）を、シート内の最も新しい
 * 終了月から決める。
 *
 * `new Date()` を使わないのは、日が変わるだけで PDF の中身が変わり、検証が再現しなく
 * なるため（同じシートからは常に同じ PDF が出る性質を保つ）。
 */
export function detailBaseline(items: ProjectItem[]): number | null {
  let latest: number | null = null;
  for (const item of items) {
    const bounds = parsePeriodBounds(item.period);
    if (!bounds) continue;
    if (latest === null || bounds.end > latest) latest = bounds.end;
  }
  return latest;
}

export interface DetailLevelResult {
  /** 案件 id → 表示レベル。 */
  levelById: Map<string, DetailLevel>;
  /** 詳細版の件数（ページ見立ての検証用）。 */
  detailCount: number;
}

/**
 * 上から順に判定し、最初に当てはまった方を採る。
 *
 * 1. 直近 DETAIL_CUTOFF_MONTHS ヶ月以内に稼働していた → 詳細版
 * 2. それ以前でも「PL 以上」かつ SENIOR_MIN_MONTHS ヶ月以上 → 詳細版
 *    （期間の長い順に SENIOR_MAX_COUNT 件まで。古くても「任せられる粒度」の証拠になる）
 * 3. 上記以外 → 簡約版
 *
 * period が解釈できない案件は簡約版に落とす（詳細版に上げると、期間不明のものが
 * 直近の実績と同じ重みで前に出てしまう）。
 */
export function resolveDetailLevels(items: ProjectItem[]): DetailLevelResult {
  const baseline = detailBaseline(items);
  const levelById = new Map<string, DetailLevel>();

  // 規則 2 の候補（規則 1 に当たらなかったもの）を、期間の長い順に選ぶために貯める。
  const seniorCandidates: { id: string; months: number }[] = [];

  for (const item of items) {
    const bounds = parsePeriodBounds(item.period);
    if (!bounds || baseline === null) {
      levelById.set(item.id, 'compact');
      continue;
    }
    const monthsSinceBaseline = Math.round((baseline - bounds.end) * 12);
    if (monthsSinceBaseline <= DETAIL_CUTOFF_MONTHS) {
      levelById.set(item.id, 'detail');
      continue;
    }
    levelById.set(item.id, 'compact');
    const months = periodMonths(item.period);
    if (isLeadRole(item.role) && months !== null && months >= SENIOR_MIN_MONTHS) {
      seniorCandidates.push({ id: item.id, months });
    }
  }

  // 同じ月数のときは items の並び順を保つ安定ソート（並びが実行ごとに変わらないようにする）。
  const order = new Map(items.map((item, index) => [item.id, index]));
  const promoted = seniorCandidates
    .sort((a, b) => b.months - a.months || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .slice(0, SENIOR_MAX_COUNT);
  for (const { id } of promoted) levelById.set(id, 'detail');

  let detailCount = 0;
  for (const level of levelById.values()) if (level === 'detail') detailCount += 1;
  return { levelById, detailCount };
}
