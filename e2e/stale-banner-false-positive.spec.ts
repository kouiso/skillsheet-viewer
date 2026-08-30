import { expect, test } from '@playwright/test';
import { createSheet, deleteSheet } from '@/db';

const viewerCode = process.env.VIEWER_CODE ?? 'viewer-code-local';

// 閲覧コードでの認証だけを前提にする（recruiter 相当の閲覧者を模す）。
// デフォルト project の storageState は編集者の Better Auth セッションを積んでいるため、
// このテストの前提と混ざらないよう明示的に空にする
// （e2e/adversarial.spec.ts の「E. auth edge cases」と同じ書き方）。
test.use({ storageState: { cookies: [], origins: [] } });

// 元の欠陥（sheets-cache.ts）: unstable_cache の revalidate（60秒）の3倍＝180秒
// fetchedAt が古いだけで「表示中の内容はしばらく更新されていない可能性があります」
// バナーを出していた。DB が健全でも、閲覧頻度が低いシートなら「静かな期間明けの
// 最初の1件」がこれに該当し、閲覧者（recruiter 相当）の目の前で誤警報が出ていた。
//
// 修正（sheets-cache.ts の withDbHealthCheck）は、fetchedAt の経過を「疑わしいので
// 直接 DB へ問い合わせて確認する」トリガーにのみ使い、実際に DB へ到達できたかどうかで
// stale を決めるようにした。この mechanism 自体（aged + 健全 → stale=false、
// aged + 到達不能 → stale=true）は unstable_cache が Next.js の実サーバー外では
// 動かない（`Invariant: incrementalCache missing` — 本番同等の `pnpm start` でしか
// 再現できない）ため、`src/server/sheets-cache.test.ts` の withDbHealthCheck 単体テストで
// mutation 込みで証明済み（fetchedAt の経過だけで stale を決める旧実装に戻すと red になる
// ことを確認済み）。180秒より長い静かな期間を安全に作る手段が無い（このリポジトリは
// 複数エージェントが同時に触っている共有の pnpm start プロセスで、閾値を縮める env や
// 設定を変えると他の作業に影響し得る）ため、ここでは "配線" — キャッシュが新鮮な通常時に
// バナーが出ないこと・ページが実際に描画されていること — を実ブラウザで固定する。
test.describe('stale banner: healthy sheet must not scare a first-time viewer', () => {
  let sheetId = '';

  test.afterEach(async () => {
    if (sheetId) {
      await deleteSheet(sheetId).catch(() => {});
      sheetId = '';
    }
  });

  test('作成直後の健全なシートには鮮度バナーが出ない', async ({ page }) => {
    const title = `Stale banner e2e ${Date.now()}`;
    sheetId = await createSheet(title);

    // recruiter 相当の閲覧者として、閲覧コードで認証してから開く。
    await page.goto('/viewer-auth', { waitUntil: 'networkidle' });
    await page.getByLabel('認証コード').fill(viewerCode);
    await page.getByRole('button', { name: '認証' }).click();
    await page.waitForURL('/view');

    await page.goto(`/view/db/${sheetId}`, { waitUntil: 'networkidle' });

    // 破壊条件: バナーが「0件」なだけでは、実は読み込みに失敗して真っ白なページでも
    // 同じ結果になる（adversarial-tester-mindset: 絵と数字が食い違ったら絵を採る）。
    // generateMetadata はシート取得に成功したときだけこのタイトルを <title> に焼く
    // （app/view/db/[id]/page.tsx）ため、これでページが実際に描画されたことも確認する。
    await expect(page).toHaveTitle(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    await expect(page.getByText('表示中の内容はしばらく更新されていない可能性があります')).toHaveCount(0);
  });
});
