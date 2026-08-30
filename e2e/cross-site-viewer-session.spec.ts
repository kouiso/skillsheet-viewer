import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';

// 元の欠陥（session.ts）: 閲覧セッション cookie が SameSite=Strict だった。
// メール/Slack/ATS に貼られた共有リンクを開く操作は、まさに cross-site の
// トップレベル遷移で、Strict だとその初回リクエストに cookie が付かない。
// 有効な7日間セッションを持つ受け取り手が、メールを開くたび毎回 /viewer-auth へ
// 差し戻されていた（実測）。既存の e2e はすべて page.goto で /viewer-auth に
// 直接入るため、Chromium がこれを same-site 扱いにしてしまい、この欠陥を検出できない
// （page.goto に「遷移元のサイト」という概念が無い）。
//
// このテストは、実際に別サイト（http://localhost:<port> — 127.0.0.1 とは
// registrable domain が異なる別サイト扱いになる）にホストしたページから、
// 本物の <a> リンククリックで trueな top-level cross-site 遷移を発生させ、
// SameSite の判定を実際に働かせる。
//
// 修正: session.ts の getSessionCookieOptions() を sameSite: 'lax' に変更。
// CSRF は auth.ts の isSameOriginRequest（Origin/Host 一致の強制）が別途担っており、
// この cookie で通せる viewerProcedure はすべて query（書き込み無し）なので、
// Strict → Lax で新たに開く攻撃面は無い（session.ts のコメント参照）。

const viewerCode = process.env.VIEWER_CODE ?? 'viewer-code-local';
const baseURL = process.env.PLAYWRIGHT_BASEURL ?? 'http://127.0.0.1:3210';

let emailServer: Server;
let emailOrigin: string;

test.beforeAll(async () => {
  emailServer = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(
      `<!doctype html><html><body>
        <p>件名: スキルシートの共有</p>
        <a href="${baseURL}/view">スキルシートを見る</a>
      </body></html>`,
    );
  });
  await new Promise<void>((resolve) => emailServer.listen(0, resolve));
  const port = (emailServer.address() as AddressInfo).port;
  // 127.0.0.1 と localhost は registrable domain が異なる別サイトとして扱われる
  // （IP リテラルはそれ自体が site、localhost は PSL に無いラベルそのものが site）。
  emailOrigin = `http://localhost:${port}/`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => emailServer.close(() => resolve()));
});

// 素の状態から始める（デフォルト project の storageState はエディタの Better Auth
// セッションを積んでいるため、このテストの前提と混ざらないよう明示的に空にする。
// e2e/adversarial.spec.ts の「E. auth edge cases」と同じ書き方）。
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('viewer session cookie survives a link click from another site', () => {
  test('メールに貼られた共有リンクを別サイトから踏んでも、有効なセッションなら再認証を求めない', async ({ page }) => {
    // 1. 通常どおり自サイトで認証コードを入力し、7日間の閲覧セッションを確立する。
    await page.goto('/viewer-auth', { waitUntil: 'networkidle' });
    await page.getByLabel('認証コード').fill(viewerCode);
    await page.getByRole('button', { name: '認証' }).click();
    await page.waitForURL('/view');

    const cookiesAfterLogin = await page.context().cookies();
    expect(cookiesAfterLogin.some((c) => c.name === 'session')).toBe(true);

    // 2. 別サイト（メールクライアント相当）のページへ移動し、そこに書かれたリンクを
    //    実際にクリックする。これが cross-site のトップレベル遷移になる。
    await page.goto(emailOrigin);
    await expect(page.getByRole('link', { name: 'スキルシートを見る' })).toBeVisible();
    await page.getByRole('link', { name: 'スキルシートを見る' }).click();

    // 3. 有効なセッションが cross-site 遷移でも使われ、/viewer-auth へ差し戻されない。
    // 破壊条件: URL だけでなく実際に一覧ページが描画されたことも見る
    // （adversarial-tester-mindset: 絵と数字が食い違ったら絵を採る）。
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/viewer-auth/);
    await expect(page.getByText('スキルシート一覧')).toBeVisible();
  });
});
