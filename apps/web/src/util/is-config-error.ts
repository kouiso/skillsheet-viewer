// 設定不備（GitHub 連携未設定・DB 未設定/未マイグレーション）を示す、コード側が
// 明示的に投げているエラーメッセージ。待っても直らない原因なので、一時的な障害
// （ネットワーク断等）とは別扱いにする（#157）。
//
// 本番ビルドでは Server Component から投げた Error のメッセージが Next.js の
// error.tsx（クライアント境界）側では digest 以外に伏せられることがあるため、
// この判定は「エラーを投げた側と同じサーバー実行コンテキスト」でのみ行うこと。
// error.tsx 側で message を見て分岐しようとしない。
const CONFIG_ERROR_MESSAGES = [
  'Missing required GitHub env vars',
  'DATABASE_URL is not set',
  'SKILLSHEET_OWNER_ID is not set',
] as const;

// GitHub API が 401（認証失敗）を返す場合。トークン不正・失効も「待っても直らない」
// 設定不備の一種として扱う（実測で GITHUB_TOKEN が無効なときも 500 になっていた）。
const GITHUB_AUTH_ERROR_PATTERN = /GitHub API error (fetching file|listing directory): 401/;

// PostgreSQL の undefined_table（テーブル不在＝ pnpm db:migrate 未実行）。
// @neondatabase/serverless はメッセージだけでなく SQLSTATE を .code に載せるため、
// 表記ゆれに強い .code を優先し、.code が取れない場合のみメッセージ文字列で判定する。
const UNDEFINED_TABLE_SQLSTATE = '42P01';

export function isConfigError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (CONFIG_ERROR_MESSAGES.some((msg) => err.message.includes(msg))) return true;
  if (GITHUB_AUTH_ERROR_PATTERN.test(err.message)) return true;
  const code = (err as { code?: unknown }).code;
  if (code === UNDEFINED_TABLE_SQLSTATE) return true;
  return /relation .* does not exist/.test(err.message);
}
