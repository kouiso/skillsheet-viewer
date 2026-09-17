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

/** 原文のdurationは変更せず、表示と承認ゲートの判定を返す。基準月は呼出側で固定する。 */
export function resolveDuration(period: string, raw: string | undefined, referenceMonth?: number): ResolvedDuration {
  if (referenceMonth === undefined)
    return { manual: raw ?? '', derivedMonths: null, label: raw?.trim() || '未確定', conflict: false };
  if (!Number.isSafeInteger(referenceMonth) || referenceMonth < 0) throw new Error('INVALID_REFERENCE_MONTH');
  const manual = raw ?? '';
  const value = manual.trim();
  const { status, bounds } = classifyPeriod(period, referenceMonth);
  if (status !== 'valid' || !bounds?.precise) {
    return { manual, derivedMonths: status === 'planned' ? 0 : null, label: value || '未確定', conflict: false };
  }
  const start = Math.round(bounds.start * 12);
  const end = bounds.openEnded ? referenceMonth : Math.min(Math.round(bounds.end * 12), referenceMonth);
  const months = Math.max(0, end - start + 1);
  const derived = `${months}か月`;
  const parsed = value ? parseDurationMonths(value) : null;
  if (bounds.openEnded && value) {
    const month = `${Math.floor(referenceMonth / 12)}-${String((referenceMonth % 12) + 1).padStart(2, '0')}`;
    return { manual, derivedMonths: months, label: `本人入力 ${value}／${month}基準 ${derived}`, conflict: false };
  }
  return {
    manual,
    derivedMonths: months,
    label: value || derived,
    conflict: value !== '' && parsed !== null && parsed !== months,
  };
}
