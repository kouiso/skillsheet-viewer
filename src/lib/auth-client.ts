'use client';

import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { createAuthClient } from 'better-auth/react';

// oauthProviderClient は Remote MCP（Issue #305）の OAuth 継続に必要。
// /login・/consent に付与された署名済みクエリ（oauth_query）をサインイン・
// 同意の POST ボディへ自動で載せ、認可フローを再開させる。
export const authClient = createAuthClient({
  plugins: [oauthProviderClient()],
});

export const { signIn, signOut, signUp, useSession } = authClient;
