import { classifyPeriod } from './process';

/** 本人入力の完全一致比較に使う。近似表現や未知表記は推測しない。 */
export function parseDurationMonths(raw: string): number | null {
  const value = raw.trim();
  if (value === '半年') return 6;
  const match = value.match(/^(?:(\d+)年)?(?:(\d+)(?:ヶ月|か月))?$/);
  if (!match || (match[1] === undefined && match[2] === undefined)) return null;
  const months = Number(match[1] ?? 0) * 12 + Number(match[2] ?? 0);
  return Number.isSafeInteger(months) ? months : null;
}

export interface ResolvedDuration {
  manual: string;
  derivedMonths: number | null;
  label: string;
  conflict: boolean;
}

/** 月数を既存の期間表記（"9ヶ月"/"1年"/"1年2ヶ月"、deriveDuration と同じ形）へ整形する。 */
function formatDurationMonths(months: number): string {
  if (months < 12) return `${months}ヶ月`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem === 0 ? `${years}年` : `${years}年${rem}ヶ月`;
}

/**
 * 原文のdurationは変更せず、表示と承認ゲートの判定を返す。
 * 閉じた期間は両端で確定できるため基準月なしでも導出する。終端「現在」だけは
 * 基準月がないと月数が定まらないため、基準月未指定では導出せず「未確定」とする
 * （現在時刻で推測するとSSR/ブラウザでずれ、保存時と表示時で変わる）。
 */
export function resolveDuration(period: string, raw: string | undefined, referenceMonth?: number): ResolvedDuration {
  if (referenceMonth !== undefined && (!Number.isSafeInteger(referenceMonth) || referenceMonth < 0))
    throw new Error('INVALID_REFERENCE_MONTH');
  const manual = raw ?? '';
  const value = manual.trim();
  const { status, bounds } = classifyPeriod(period, referenceMonth);
  if (status !== 'valid' || !bounds?.precise) {
    return { manual, derivedMonths: status === 'planned' ? 0 : null, label: value || '未確定', conflict: false };
  }
  if (bounds.openEnded && referenceMonth === undefined) {
    return { manual, derivedMonths: null, label: value || '未確定', conflict: false };
  }
  const start = Math.round(bounds.start * 12);
  const end = bounds.openEnded
    ? referenceMonth!
    : referenceMonth === undefined
      ? Math.round(bounds.end * 12)
      : Math.min(Math.round(bounds.end * 12), referenceMonth);
  const months = Math.max(0, end - start + 1);
  const derived = formatDurationMonths(months);
  const parsed = value ? parseDurationMonths(value) : null;
  if (bounds.openEnded && value) {
    const month = `${Math.floor(referenceMonth! / 12)}-${String((referenceMonth! % 12) + 1).padStart(2, '0')}`;
    return { manual, derivedMonths: months, label: `本人入力 ${value}／${month}基準 ${derived}`, conflict: false };
  }
  return {
    manual,
    derivedMonths: months,
    label: value || derived,
    conflict: value !== '' && parsed !== null && parsed !== months,
  };
}
