import type { ReactNode } from 'react';

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

const INVALID_URL_MESSAGES = ['Invalid URL', 'ERR_INVALID_URL'] as const;

// GitHub API が 401（認証失敗）を返す場合。トークン不正・失効も「待っても直らない」
// 設定不備の一種として扱う（実測で GITHUB_TOKEN が無効なときも 500 になっていた）。
const GITHUB_AUTH_ERROR_PATTERN = /GitHub API error (fetching file|listing directory): 401/;

// PostgreSQL の undefined_table（テーブル不在＝ pnpm db:migrate 未実行）。
// @neondatabase/serverless はメッセージだけでなく SQLSTATE を .code に載せるため、
// 表記ゆれに強い .code を優先し、.code が取れない場合のみメッセージ文字列で判定する。
const UNDEFINED_TABLE_SQLSTATE = '42P01';

export type ConfigErrorType =
  | 'missing-github'
  | 'missing-db'
  | 'invalid-db-url'
  | 'github-token-invalid'
  | 'db-unmigrated';

type ErrorNode = Error & { code?: unknown; cause?: unknown };

function isErrorNode(value: unknown): value is ErrorNode {
  return value instanceof Error;
}

/** エラーチェーン（cause 連鎖）を循環防止しつつ展開する。 */
function getErrorChain(err: unknown): ErrorNode[] {
  const chain: ErrorNode[] = [];
  const seen = new WeakSet<object>();
  let current: unknown = err;
  let depth = 0;
  while (isErrorNode(current) && depth < 5) {
    if (seen.has(current)) break;
    seen.add(current);
    chain.push(current);
    current = current.cause;
    depth += 1;
  }
  return chain;
}

function getConfigErrorTypeFromNode(err: ErrorNode): ConfigErrorType | null {
  if (err.message.includes('Missing required GitHub env vars')) return 'missing-github';
  if (CONFIG_ERROR_MESSAGES.some((msg) => err.message.includes(msg))) {
    // GitHub の判定を優先したあとで DB 系未設定を判定
    if (err.message.includes('DATABASE_URL is not set') || err.message.includes('SKILLSHEET_OWNER_ID is not set')) {
      return 'missing-db';
    }
  }
  if (INVALID_URL_MESSAGES.some((msg) => err.message.includes(msg))) return 'invalid-db-url';
  if (GITHUB_AUTH_ERROR_PATTERN.test(err.message)) return 'github-token-invalid';

  const code = err.code;
  if (code === UNDEFINED_TABLE_SQLSTATE) return 'db-unmigrated';
  if (/relation .* does not exist/.test(err.message)) return 'db-unmigrated';

  return null;
}

export function getConfigErrorType(err: unknown): ConfigErrorType | null {
  for (const node of getErrorChain(err)) {
    const type = getConfigErrorTypeFromNode(node);
    if (type) return type;
  }
  return null;
}

export function isConfigError(err: unknown): boolean {
  return getConfigErrorType(err) !== null;
}

export interface ConfigErrorNoticeData {
  title: string;
  message: string;
  hints?: { key: string; content: ReactNode }[];
}
