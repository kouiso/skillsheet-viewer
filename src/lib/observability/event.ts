/**
 * 手動 capture するイベントの閉じた判別共用体。
 *
 * enum 以外に `string` を置かない。シート名・ファイル名・エラーメッセージ本文のような
 * 「書けてしまう」自由文字列を型から締め出す。新しいイベントを足すときも、
 * プロパティ型に `string` を書きたくなったら enum に変換できないか先に考えること。
 */
export type ViewKind = 'markdown' | 'dashboard';
export type SheetSource = 'db' | 'github';
// src/components/viewer-topbar.tsx の ViewKey と同じ値。型を直接 import すると
// components → lib/observability の依存方向が逆転するので、値の集合だけを複製する
// （viewer-topbar.tsx 側を変えたらここも変えること。両者が一致するかは event.test.ts の
// 型テストが検査する）。
export type ViewToggleKey = 'skills' | 'process' | 'projects' | 'timeline';
export type PdfResult = 'success' | 'failure';
export type PdfFailureReason = 'TypeError' | 'RangeError' | 'FetchError' | 'Error' | 'unknown';
export type SecondsBucket = '0-5' | '5-15' | '15-30' | '30-60' | '60+';
export type ViewerAuthOutcome = 'success' | 'invalid_code' | 'rate_limited' | 'error';

const SECONDS_BUCKETS: ReadonlyArray<{ maxMs: number; label: SecondsBucket }> = [
  { maxMs: 5_000, label: '0-5' },
  { maxMs: 15_000, label: '5-15' },
  { maxMs: 30_000, label: '15-30' },
  { maxMs: 60_000, label: '30-60' },
];

/** 経過ミリ秒を SecondsBucket に丸める。読了時間（use-read-depth）と PDF 生成時間で同じ区切りを使う。 */
export function toSecondsBucket(elapsedMs: number): SecondsBucket {
  const found = SECONDS_BUCKETS.find((b) => elapsedMs < b.maxMs);
  return found?.label ?? '60+';
}

export type ObservabilityEvent =
  | { name: 'sheet_viewed'; layout: ViewKind; source: SheetSource; blockCount: number }
  | { name: 'sheet_read_depth'; depthPercent: 25 | 50 | 75 | 100; secondsBucket: SecondsBucket }
  | { name: 'sheet_view_toggled'; view: ViewToggleKey; enabled: boolean }
  | { name: 'pdf_exported'; result: PdfResult; durationBucket: SecondsBucket; reason?: PdfFailureReason }
  | { name: 'viewer_auth_submitted'; outcome: ViewerAuthOutcome };
