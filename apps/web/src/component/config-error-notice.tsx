import type { ReactNode } from 'react';

import type { ConfigErrorKind } from '@/util/is-config-error';

interface ConfigErrorNoticeProps {
  title: string;
  message: string;
  hints?: { key: string; content: ReactNode }[];
}

/**
 * 「設定不備（GitHub 連携未設定・DB 未設定/未マイグレーション）」用の共通の案内 UI。
 *
 * 一時的な障害（error.tsx が担当）とは違い、待っても直らない原因なので
 * HTTP 200 で原因と対処を返す。/view・/view/db・/view/db/[id]・/view/[path] の
 * 4経路が同じ原因に対して同じ見た目を返すよう、ここに集約する（#157）。
 */
export function ConfigErrorNotice({ title, message, hints }: ConfigErrorNoticeProps) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="text-muted-foreground">{message}</p>
      {hints && hints.length > 0 && (
        <ul className="list-disc space-y-1 text-left text-sm text-muted-foreground">
          {hints.map((hint) => (
            <li key={hint.key}>{hint.content}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// DB 正本経路（/view・/view/db・/view/db/[id]）が共通で使う案内文（未設定・未マイグレーション）。
export const DB_CONFIG_NOTICE = {
  title: 'スキルシートを表示できません',
  message: 'データベースのセットアップが完了していない可能性があります。以下を確認してください。',
  hints: [
    {
      key: 'env',
      content: (
        <>
          環境変数 <code className="font-mono">DATABASE_URL</code> /{' '}
          <code className="font-mono">SKILLSHEET_OWNER_ID</code> を設定する
        </>
      ),
    },
    {
      key: 'migrate',
      content: (
        <>
          マイグレーションを実行する: <code className="font-mono">pnpm db:migrate</code>
        </>
      ),
    },
  ],
};

// DB 正本経路で、DATABASE_URL の値はあるが書式が壊れている場合の案内文（Issue #195）。
// いちばん多い踏み方は値を引用符ごと環境変数へ渡してしまうケースなので、そのものを名指しする。
export const DB_MALFORMED_URL_NOTICE = {
  title: 'スキルシートを表示できません',
  message: '接続文字列（DATABASE_URL）の書式が正しくありません。以下を確認してください。',
  hints: [
    {
      key: 'quotes',
      content: (
        <>
          値に引用符（<code className="font-mono">&quot;</code> や <code className="font-mono">&apos;</code>
          ）が混ざっていないか確認する（<code className="font-mono">.env</code>{' '}
          には引用符を含めず生の接続文字列だけを書く）
        </>
      ),
    },
    {
      key: 'format',
      content: (
        <>
          値が <code className="font-mono">postgres://user:password@host/db?sslmode=require</code>{' '}
          の形式になっているか確認する
        </>
      ),
    },
  ],
};

// GitHub 連携経路（/view/[path]）で、環境変数自体が未設定の場合の案内文。
export const GITHUB_MISSING_ENV_NOTICE = {
  title: '表示できません',
  message: 'GitHub 連携が未設定のため表示できません。以下の環境変数を設定してください。',
  hints: [
    {
      key: 'vars',
      content: (
        <>
          <code className="font-mono">GITHUB_TOKEN</code> / <code className="font-mono">GITHUB_OWNER</code> /{' '}
          <code className="font-mono">GITHUB_REPO</code> / <code className="font-mono">GITHUB_FILE_PATH</code> /{' '}
          <code className="font-mono">GITHUB_BRANCH</code>
        </>
      ),
    },
  ],
};

// GitHub 連携経路で、トークンが GitHub 側に拒否された（401）場合の案内文。
// 従来はこのケースも「未設定」と同じ文面で案内しており、環境変数は設定済みなのに
// 未設定を疑わせて調査を誤誘導していた（Issue #195）。
export const GITHUB_AUTH_FAILED_NOTICE = {
  title: '表示できません',
  message:
    'GitHub のアクセストークンが拒否されました（認証エラー）。環境変数は設定済みですが、トークンが無効か失効しています。',
  hints: [
    {
      key: 'reissue',
      content: (
        <>
          <code className="font-mono">GITHUB_TOKEN</code> を GitHub 側で再発行し、環境変数を差し替える
        </>
      ),
    },
  ],
};

/** classifyConfigError() の結果からそのまま渡せる案内文の一覧。 */
export const CONFIG_ERROR_NOTICES: Record<
  ConfigErrorKind,
  { title: string; message: string; hints?: { key: string; content: ReactNode }[] }
> = {
  'db-missing-env': DB_CONFIG_NOTICE,
  'db-table-missing': DB_CONFIG_NOTICE,
  'db-malformed-url': DB_MALFORMED_URL_NOTICE,
  'github-missing-env': GITHUB_MISSING_ENV_NOTICE,
  'github-auth-failed': GITHUB_AUTH_FAILED_NOTICE,
};
