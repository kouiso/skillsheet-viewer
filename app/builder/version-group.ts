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
    else if (run.length > 1) rows.push({ kind: 'group', versions: run });
    run = [];
  };
  // まとまりの起点は新しい側。区切りは「新しいほうから見て、直近の保存と
  // まとまりの先頭（最新版）」で決まるので新しい順に走査する。
  // こうすると一覧の末尾へ古い版を追加読み込みしても既存のまとまりの
  // 境界は変わらず、伸びるのは一番古いまとまりの下端だけになる
  // （開閉キーを group.versions[0]（最新）で持つ UI と対になる）。
  for (const version of versions) {
    if (version.action !== 'save') {
      flush();
      rows.push({ kind: 'single', version });
      continue;
    }
    const at = Date.parse(version.recordedAt);
    const newest = run[0];
    const prev = run.at(-1);
    // 時刻が読めない版は他とまとめない（NaN との比較は常に false）。
    // 並行した保存では recordedAt が版番号の順と逆になりうるので、差は絶対値で見る。
    // 逆転が数秒なら同じまとまり、2分以上なら（時計のずれ・後からの投入など）別のまとまりにする。
    const joins =
      newest !== undefined &&
      prev !== undefined &&
      Math.abs(Date.parse(prev.recordedAt) - at) < IDLE_GAP_MS &&
      Math.abs(Date.parse(newest.recordedAt) - at) < MAX_SPAN_MS;
    if (!joins) flush();
    run.push(version);
  }
  flush();
  return rows;
}
