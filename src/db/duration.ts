import { currentMonthKey } from './derived-display';
import { classifyPeriod, formatPeriodRange } from './process';

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
  const start = Math.round(bounds.start * 12);
  if (bounds.openEnded) {
    if (referenceMonth === undefined) {
      return { manual, derivedMonths: null, label: value || '未確定', conflict: false };
    }
    const months = Math.max(0, referenceMonth - start + 1);
    const derived = formatDurationMonths(months);
    if (value) {
      const month = `${Math.floor(referenceMonth / 12)}-${String((referenceMonth % 12) + 1).padStart(2, '0')}`;
      return { manual, derivedMonths: months, label: `本人入力 ${value}／${month}基準 ${derived}`, conflict: false };
    }
    return { manual, derivedMonths: months, label: derived, conflict: false };
  }
  const closedEnd = Math.round(bounds.end * 12);
  const end = referenceMonth === undefined ? closedEnd : Math.min(closedEnd, referenceMonth);
  const months = Math.max(0, end - start + 1);
  const derived = formatDurationMonths(months);
  const parsed = value ? parseDurationMonths(value) : null;
  // conflict は「期間そのものの幅」と比較する。derivedMonths（経過月）は基準月で
  // clamp されるため、終了が基準月より後の閉じた期間に使うと、正しい本人入力を
  // 矛盾と誤判定して PDF 出力を止めてしまう（#354）。
  const periodMonths = Math.max(0, closedEnd - start + 1);
  return {
    manual,
    derivedMonths: months,
    label: value || derived,
    conflict: value !== '' && parsed !== null && parsed !== periodMonths,
  };
}

/**
 * 月入力（YYYY-MM）から期間の長さバッジ（"Nヶ月"/"N年Mヶ月"）を導出する。
 * viewer/PDF と同じ resolveDuration に寄せて語彙を統一する。ongoing でも
 * 「継続中」ではなく基準月時点の月数を出す（旧 deriveDuration との差）。
 */
export function durationFromRange(start: string, end: string, ongoing: boolean): string {
  const period = formatPeriodRange(start, end, ongoing);
  // 開始のみの不完全な期間（"2020.06"）には月数を推測せずバッジを出さない。
  if (!period.includes(' — ')) return '';
  return resolveDuration(period, undefined, currentMonthKey()).label;
}
