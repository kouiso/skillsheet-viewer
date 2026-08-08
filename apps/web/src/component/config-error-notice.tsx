import type { ReactNode } from 'react';

import { type ConfigErrorNoticeData, getConfigErrorType } from '@/util/is-config-error';

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

const DB_MISSING_NOTICE: ConfigErrorNoticeData = {
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

const DB_UNMIGRATED_NOTICE: ConfigErrorNoticeData = {
  ...DB_MISSING_NOTICE,
  message: 'データベースのテーブルが見つかりません。マイグレーションを実行してください。',
};

const DB_URL_NOTICE: ConfigErrorNoticeData = {
  title: 'スキルシートを表示できません',
  message: 'データベース接続文字列（DATABASE_URL）の書式が正しくありません。',
  hints: [
    {
      key: 'quote',
      content: (
        <>
          値に引用符 <code className="font-mono">&quot;</code> が含まれていないか確認する
        </>
      ),
    },
    {
      key: 'env',
      content: (
        <>
          環境変数 <code className="font-mono">DATABASE_URL</code> の値を修正する
        </>
      ),
    },
  ],
};

const GITHUB_MISSING_NOTICE: ConfigErrorNoticeData = {
  title: '表示できません',
  message: 'GitHub 連携が未設定のため表示できません。管理者に環境変数の設定を依頼してください。',
  hints: [
    {
      key: 'env',
      content: (
        <>
          環境変数 <code className="font-mono">GITHUB_TOKEN</code> / <code className="font-mono">GITHUB_OWNER</code> /{' '}
          <code className="font-mono">GITHUB_REPO</code> を設定する
        </>
      ),
    },
  ],
};

const GITHUB_TOKEN_NOTICE: ConfigErrorNoticeData = {
  title: '表示できません',
  message: 'GitHub のアクセストークンが拒否されました。トークンを再発行して差し替えてください。',
  hints: [
    {
      key: 'env',
      content: (
        <>
          環境変数 <code className="font-mono">GITHUB_TOKEN</code> の値を更新する
        </>
      ),
    },
    {
      key: 'gh',
      content: <>GitHub 上で該当トークンが失効・期限切れになっていないか確認する</>,
    },
  ],
};

/** エラーに応じた設定不備の案内文を返す。設定不備でなければ null。 */
export function getConfigErrorNotice(err: unknown): ConfigErrorNoticeData | null {
  const type = getConfigErrorType(err);
  switch (type) {
    case 'missing-github':
      return GITHUB_MISSING_NOTICE;
    case 'missing-db':
      return DB_MISSING_NOTICE;
    case 'invalid-db-url':
      return DB_URL_NOTICE;
    case 'github-token-invalid':
      return GITHUB_TOKEN_NOTICE;
    case 'db-unmigrated':
      return DB_UNMIGRATED_NOTICE;
    default:
      return null;
  }
}

// 互換性のため、既存の単一用途の定数も残す。
export const DB_CONFIG_NOTICE = DB_MISSING_NOTICE;
export const GITHUB_CONFIG_NOTICE = GITHUB_MISSING_NOTICE;
