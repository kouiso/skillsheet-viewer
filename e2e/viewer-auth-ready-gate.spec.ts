import { expect, test } from '@playwright/test';

// #398: /viewer-auth は「読み込み直後に入力して送ると失敗する」ことがあった
// （サーバー記録では 17 回中 2 回が 401）。疑わしい届き方は「画面の準備前に
// 送ると空のコードが飛ぶ」。送信を画面の初期化（React の mount）完了まで
// 無効化する防御を検証する。
//
// 画面側の準備シグナルは「useEffect が走ったか」（= React が DOM を引き継いで
// 制御下に置いたか）。テストではクライアント JS の読み込みを遮断して hydration
// 自体を止めることで、このシグナルをタイミング依存ではなく決定的に制御する。

const viewerCode = process.env.VIEWER_CODE ?? 'viewer-code-local';

// httpBatchLink は mutation を `/api/trpc/auth.login?batch=1` へ POST する。
const LOGIN_PATH = '/api/trpc/auth.login';

// 閲覧者は認証前の新規訪問者なので、プロジェクトの storageState（編集者ログイン）は
// 引き継がず空の状態を明示する。
const EMPTY_STORAGE = { cookies: [], origins: [] };

test.describe('/viewer-auth 初期化ゲート (#398)', () => {
  test('hydration 前は入力欄と送信ボタンが無効で、submit を仕掛けても auth.login は飛ばない', async ({
    browser,
  }) => {
    // クライアント JS チャンクを遮断して hydration が完了しない状態を作る。
    // SSR HTML 上の disabled 属性だけで「準備前」が決定的に再現できる。
    const context = await browser.newContext({ storageState: EMPTY_STORAGE });
    const page = await context.newPage();
    try {
      await context.route('**/_next/static/**/*.js', (route) => route.abort());

      const loginRequests: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes(LOGIN_PATH)) loginRequests.push(request.url());
      });

      await page.goto('/viewer-auth', { waitUntil: 'domcontentloaded' });

      await expect(page.getByLabel('認証コード')).toBeDisabled();
      await expect(page.getByRole('button', { name: '認証' })).toBeDisabled();

      // disabled なボタンの押下に頼らないプログラマティックな submit
      // （requestSubmit / Enter 相当）でも、初期化前に認証リクエストが発行されないこと。
      await page.evaluate(() => document.querySelector('form')?.requestSubmit());
      // フォームのネイティブ送信（ページリロード）は起きてよい。検証対象は
      // 「auth.login が飛ばない」ことだけなので、発火を待つ窓を短く取る。
      await page.waitForTimeout(500);
      expect(loginRequests).toHaveLength(0);
    } finally {
      await context.close();
    }
  });

  test('読み込み直後の入力→送信を 20 回連続で試しても空コードが飛ばず全て成功する', async ({
    browser,
  }) => {
    // 失敗の定義（Issue の完了条件）: 空のコードが飛ぶ、または auth.login が
    // 401/429 等の失敗を返す。送信ペイロードを捕捉して入力値そのものが届くことと、
    // レスポンスが成功であることを毎回確認する。
    for (let i = 0; i < 20; i++) {
      // 「初回訪問の読み込み直後」を再現するため毎回新規コンテキストを使う。
      const context = await browser.newContext({ storageState: EMPTY_STORAGE });
      const page = await context.newPage();
      try {
        const sentCodes: unknown[] = [];
        await context.route(`**${LOGIN_PATH}*`, async (route) => {
          // tRPC のボディは batch 時 {"0":{"json":{"code":...}}}、非 batch 時
          // {"json":{"code":...}}。両方から code を取り出す。
          const body = route.request().postDataJSON() as Record<string, unknown> | null;
          const entry = (body?.['0'] ?? body) as { json?: { code?: unknown } } | undefined;
          sentCodes.push(entry?.json?.code);
          await route.continue();
        });

        await page.goto('/viewer-auth', { waitUntil: 'domcontentloaded' });
        // 待機を挟まず即座に入力して送信する。入力欄・ボタンが初期化完了まで
        // disabled のため、fill/click の actionability 待機そのものが
        // 「準備前は送れない」ゲートの検証になる。
        await page.getByLabel('認証コード').fill(viewerCode);
        const [response] = await Promise.all([
          page.waitForResponse((r) => r.url().includes(LOGIN_PATH)),
          page.getByRole('button', { name: '認証' }).click(),
        ]);
        expect(response.status(), `iteration ${i + 1}: auth.login must succeed`).toBe(200);
        expect(sentCodes.at(-1), `iteration ${i + 1}: sent code must be the typed code`).toBe(
          viewerCode,
        );
        // 成功すると /view へ遷移する。「/view」は「/viewer-auth」の接頭辞でもあるため
        // 後続が ?/#/末尾 であることを要求して /viewer-auth への部分一致を除く
        // （pdf-print-view.spec.ts で同じ罠を踏んだ実測あり）。
        await page.waitForURL(/\/view([?#/]|$)/, { timeout: 15_000 });
      } finally {
        await context.close();
      }
    }
  });
});
