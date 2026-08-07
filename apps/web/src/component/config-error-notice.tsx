import type { ReactNode } from 'react';

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

// DB 正本経路（/view・/view/db・/view/db/[id]）が共通で使う案内文。
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

// GitHub 連携経路（/view/[path]）が使う案内文。
export const GITHUB_CONFIG_NOTICE = {
  title: '表示できません',
  message: 'GitHub 連携が未設定のため表示できません。管理者に環境変数の設定を依頼してください。',
};
