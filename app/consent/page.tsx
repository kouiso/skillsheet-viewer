'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { Button } from '@/component/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/component/ui/card';
import { authClient } from '@/lib/auth-client';

// Remote MCP（Issue #305）の OAuth 同意画面。
// 認可エンドポイントから /consent?<署名済みクエリ> へリダイレクトされてくる。
// クエリには client_id / scope / state 等の認可パラメータと署名が含まれ、
// oauthProviderClient が POST ボディの oauth_query として自動で引き回す。

const SCOPE_LABELS: Record<string, string> = {
  'skillsheet:read': 'スキルシートの閲覧',
  'skillsheet:write': 'スキルシートの編集',
};

function ConsentForm() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('client_id') ?? '';
  const requestedScopes = (searchParams.get('scope') ?? '').split(' ').filter(Boolean);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const decide = async (accept: boolean) => {
    setError('');
    setSubmitting(true);
    try {
      const res = await authClient.oauth2.consent({ accept });
      const url =
        (res.data as { redirect_uri?: string; url?: string } | null)?.redirect_uri ??
        (res.data as { url?: string } | null)?.url;
      if (url) {
        window.location.assign(url);
        return;
      }
      if (res.error) {
        setError(
          res.error.status === 401 ? 'ログインが必要です。先にログインしてください。' : '同意の処理に失敗しました。',
        );
      } else {
        setError('同意の処理に失敗しました。');
      }
    } catch {
      setError('同意の処理に失敗しました。もう一度お試しください。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>アプリへのアクセス許可</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 text-sm">
          <p>
            <span className="font-medium">{clientId || '外部アプリケーション'}</span> が
            スキルシートへのアクセスを要求しています。
          </p>
          {requestedScopes.length > 0 && (
            <ul className="list-inside list-disc text-muted-foreground">
              {requestedScopes.map((s) => (
                <li key={s}>{SCOPE_LABELS[s] ?? s}</li>
              ))}
            </ul>
          )}
        </div>
        {error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive-strong"
          >
            {error}
          </div>
        )}
        <div className="flex gap-3">
          <Button disabled={submitting} onClick={() => void decide(true)}>
            許可する
          </Button>
          <Button variant="outline" disabled={submitting} onClick={() => void decide(false)}>
            拒否する
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ConsentPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <ConsentForm />
      </Suspense>
    </div>
  );
}
