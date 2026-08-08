// 設定不備（GitHub 連携未設定・DB 未設定/未マイグレーション/接続文字列の書式ミス）を示す、
// コード側が明示的に投げているエラーメッセージ。待っても直らない原因なので、一時的な障害
// （ネットワーク断等）とは別扱いにする（#157）。
//
// 本番ビルドでは Server Component から投げた Error のメッセージが Next.js の
// error.tsx（クライアント境界）側では digest 以外に伏せられることがあるため、
// この判定は「エラーを投げた側と同じサーバー実行コンテキスト」でのみ行うこと。
// error.tsx 側で message を見て分岐しようとしない。

// GitHub API が 401（認証失敗）を返す場合。トークン不正・失効も「待っても直らない」
// 設定不備の一種として扱う（実測で GITHUB_TOKEN が無効なときも 500 になっていた）。
// ただし「未設定」とは原因も対処も異なるため、案内文は分けて出す（Issue #195）。
const GITHUB_AUTH_ERROR_PATTERN = /GitHub API error (fetching file|listing directory): 401/;

// PostgreSQL の undefined_table（テーブル不在＝ pnpm db:migrate 未実行）。
// @neondatabase/serverless はメッセージだけでなく SQLSTATE を .code に載せるため、
// 表記ゆれに強い .code を優先し、.code が取れない場合のみメッセージ文字列で判定する。
const UNDEFINED_TABLE_SQLSTATE = '42P01';

// Node の URL パーサが投げる無効な URL のエラーコード。DATABASE_URL に値は入っているが
// 書式が壊れている場合（例: 値を引用符ごと環境変数に渡してしまった）に発生する。
// packages/db/src/client.ts は「未設定（falsy）」しか弾いておらず、書式が壊れた値は
// そのまま接続処理まで進んで ERR_INVALID_URL が throw されていた（Issue #195）。
const INVALID_URL_CODE = 'ERR_INVALID_URL';

export type ConfigErrorKind =
  | 'db-missing-env'
  | 'db-malformed-url'
  | 'db-table-missing'
  | 'github-missing-env'
  | 'github-auth-failed';

/** エラーが「待っても直らない設定不備」に該当するかを判定し、原因の種類まで返す。 */
export function classifyConfigError(err: unknown): ConfigErrorKind | null {
  if (!(err instanceof Error)) return null;
  if (err.message.includes('Missing required GitHub env vars')) return 'github-missing-env';
  if (GITHUB_AUTH_ERROR_PATTERN.test(err.message)) return 'github-auth-failed';
  if (err.message.includes('DATABASE_URL is not set') || err.message.includes('SKILLSHEET_OWNER_ID is not set')) {
    return 'db-missing-env';
  }
  const code = (err as { code?: unknown }).code;
  if (code === UNDEFINED_TABLE_SQLSTATE || /relation .* does not exist/.test(err.message)) {
    return 'db-table-missing';
  }
  if (code === INVALID_URL_CODE) return 'db-malformed-url';
  return null;
}

export function isConfigError(err: unknown): boolean {
  return classifyConfigError(err) !== null;
}
