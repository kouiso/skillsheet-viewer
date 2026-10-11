import type { VersionSummary } from '@/db/document-history';

// 自動保存は手を止めて 0.6 秒で走るため、保存1回ごとに1行並べると一覧が読めない。
// 版は DB にすべて残したまま、表示だけ「手を止めて2分・続いても最長10分」でたたむ（#383）。
// 版を消さないので、たたんだ中のどの保存時点にも戻れる。
export const IDLE_GAP_MS = 2 * 60 * 1000;
export const MAX_SPAN_MS = 10 * 60 * 1000;

export type VersionRow =
  | { kind: 'single'; version: VersionSummary }
  // versions は一覧と同じく新しい順。
  | { kind: 'group'; versions: VersionSummary[] };

/** 新しい順の版一覧を、表示用の行（新しい順）にたたむ。入力の版は必ずどれか1行に1回だけ入る。 */
export function groupVersions(versions: readonly VersionSummary[]): VersionRow[] {
  const rows: VersionRow[] = [];
  let run: VersionSummary[] = [];
  const flush = () => {
    if (run.length === 1) rows.push({ kind: 'single', version: run[0] });
    else if (run.length > 1) rows.push({ kind: 'group', versions: [...run].reverse() });
    run = [];
  };
  // 区切りは「古いほうから見て、直前の保存とまとまりの始まり」で決まるので古い順に走査する。
  for (const version of [...versions].reverse()) {
    if (version.action !== 'save') {
      flush();
      rows.push({ kind: 'single', version });
      continue;
    }
    const at = Date.parse(version.recordedAt);
    const first = run[0];
    const last = run.at(-1);
    // 時刻が読めない版は他とまとめない（NaN との比較は常に false）。
    const joins =
      first !== undefined &&
      last !== undefined &&
      at - Date.parse(last.recordedAt) < IDLE_GAP_MS &&
      at - Date.parse(first.recordedAt) < MAX_SPAN_MS;
    if (!joins) flush();
    run.push(version);
  }
  flush();
  return rows.reverse();
}
