/**
 * 手動 capture するイベントの閉じた判別共用体。
 *
 * enum 以外に `string` を置かない。シート名・ファイル名・エラーメッセージ本文のような
 * 「書けてしまう」自由文字列を型から締め出す。新しいイベントを足すときも、
 * プロパティ型に `string` を書きたくなったら enum に変換できないか先に考えること。
 */
export type ViewKind = 'markdown' | 'dashboard';
export type SheetSource = 'db' | 'github';
export type ViewToggleKey = 'timeline' | 'summary' | 'detail';
export type PdfResult = 'success' | 'failure';
export type PdfFailureReason = 'TypeError' | 'RangeError' | 'FetchError' | 'Error' | 'unknown';
export type SecondsBucket = '0-5' | '5-15' | '15-30' | '30-60' | '60+';
export type ViewerAuthOutcome = 'success' | 'invalid_code' | 'rate_limited' | 'error';

export type ObservabilityEvent =
  | { name: 'sheet_viewed'; layout: ViewKind; source: SheetSource; blockCount: number }
  | { name: 'sheet_read_depth'; depthPercent: 25 | 50 | 75 | 100; secondsBucket: SecondsBucket }
  | { name: 'sheet_view_toggled'; view: ViewToggleKey; enabled: boolean }
  | { name: 'pdf_exported'; result: PdfResult; durationBucket: SecondsBucket; reason?: PdfFailureReason }
  | { name: 'viewer_auth_submitted'; outcome: ViewerAuthOutcome };
