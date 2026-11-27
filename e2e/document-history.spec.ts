import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';
import { buildRealVolumeDemoBlocks } from '../src/db/fixture';
import type { AppRouter } from '../src/server/trpc/router';
import { authFile, login } from './auth';

test.use({ storageState: authFile });

/** 実ブラウザと同じcookieでHTTP入口を通す。DBテーブル直読やAPI stubは使わない。 */
function clientFor(page: Page) {
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: new URL('/api/trpc', page.url()).href,
        transformer: superjson,
        fetch: async (url, options) => {
          if (options?.body != null && typeof options.body !== 'string') throw new Error('Unexpected RPC body');
          const response = await page.request.fetch(String(url), {
            method: options?.method,
            headers: Object.fromEntries(new Headers(options?.headers)),
            data: options?.body ?? undefined,
          });
          return new Response(await response.text(), { status: response.status(), headers: response.headers() });
        },
      }),
    ],
  });
}

test('consecutive saves collapse into one history row that expands to every version', async ({ page }) => {
  await login(page);
  const client = clientFor(page);
  const sheetId = randomUUID();
  const blockId = randomUUID();
  const body = (text: string) => [{ id: blockId, type: 'markdown', order: 0, data: { markdown: text } }];
  const created = await client.sheet.create.mutate({ sheetId, title: 'History group', blocks: body('v0') });
  try {
    // 自動保存と同じく間を置かずに3回保存する。2分未満なので1つのまとまりになる。
    let revision = created.revision;
    const saved: string[] = [];
    for (const text of ['v1', 'v2', 'v3']) {
      revision = (
        await client.sheet.save.mutate({
          sheetId,
          expectedRevision: revision,
          title: 'History group',
          blocks: body(text),
        })
      ).revision;
      saved.push(revision);
    }
    const [oldest, , newest] = saved;

    await page.goto(`/builder?sheet=${sheetId}`);
    await page.getByRole('button', { name: '版の履歴を開く', exact: true }).click();
    const list = page.getByRole('complementary', { name: '保存された版' });
    // 既定の比較元は2番目に新しい版（保存のまとまりの内側）なので、選んだ行が見えるよう開いて始まる。
    const toggle = list.getByRole('button', { name: `版 ${oldest}〜${newest} の内訳を閉じる`, exact: true });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(list.getByText(`保存 3回 · 版 ${oldest}〜${newest}`, { exact: true })).toBeVisible();
    // 板どおり、比較元・比較先は行の［比較元］［比較先］で選ぶ。選択欄は無い。
    const pick = (side: '比較元' | '比較先', revision: string) =>
      list.getByRole('button', { name: `${side}（版 ${revision}）`, exact: true });
    await expect(page.getByRole('combobox')).toHaveCount(0);
    for (const version of saved) await expect(pick('比較先', version)).toBeVisible();
    // 閉じると、作成の版はたたまず1行で残り、保存の版は行として出ない。
    await toggle.click();
    const closed = list.getByRole('button', { name: `版 ${oldest}〜${newest} の内訳を開く`, exact: true });
    await expect(closed).toHaveAttribute('aria-expanded', 'false');
    await expect(pick('比較先', created.revision)).toBeVisible();
    await expect(pick('比較先', saved[1])).toHaveCount(0);
    await closed.click();
    for (const version of saved) await expect(pick('比較先', version)).toBeVisible();
    await pick('比較先', saved[1]).click();
    await expect(pick('比較先', saved[1])).toHaveAttribute('aria-pressed', 'true');
    await pick('比較元', created.revision).click();
    await expect(pick('比較元', created.revision)).toHaveAttribute('aria-pressed', 'true');
    // 選んだ2版（作成 v0 → 2回目の保存 v2）の差分が出る。
    await expect(page.locator('del', { hasText: 'v0' })).toBeVisible();
    await expect(page.locator('ins', { hasText: 'v2' })).toBeVisible();
  } finally {
    const current = await client.sheet.builderState.query({ sheetId });
    if (current.status === 'OK')
      await client.sheet.delete.mutate({ sheetId, expectedRevision: current.snapshot.revision });
  }
});

test('history records immutable snapshots, restores and undoes through UI, and rejects stale CAS', async ({ page }) => {
  await login(page);
  const client = clientFor(page);
  const sheetId = randomUUID();
  const blockId = randomUUID();
  const original = [{ id: blockId, type: 'markdown', order: 0, data: { markdown: 'History smoke original' } }];
  const updated = [{ id: blockId, type: 'markdown', order: 0, data: { markdown: 'History smoke updated' } }];
  const first = await client.sheet.create.mutate({ sheetId, title: 'History smoke original', blocks: original });
  try {
    const saved = await client.sheet.save.mutate({
      sheetId,
      expectedRevision: first.revision,
      title: 'History smoke updated',
      blocks: updated,
    });
    const rows = await client.sheet.history.list.query({ sheetId });
    expect(rows.map((row) => row.revision)).toEqual([saved.revision, first.revision]);
    expect(await client.sheet.history.read.query({ sheetId, revision: first.revision })).toMatchObject({
      title: first.title,
      blocks: original,
    });
    const stalePreview = await client.sheet.history.previewRestore.query({
      sheetId,
      targetRevision: first.revision,
      expectedRevision: saved.revision,
    });
    expect(stalePreview.canRestore).toBe(true);
    expect(stalePreview.laterRevisionCount).toBe('1');

    await page.goto(`/builder?sheet=${sheetId}`);
    await page.getByRole('button', { name: '版の履歴を開く', exact: true }).click();
    await expect(page.getByRole('heading', { name: '版の履歴', exact: true })).toBeVisible();
    await page.getByRole('button', { name: `比較先（版 ${first.revision}）`, exact: true }).click();
    await page.getByRole('button', { name: `比較元（版 ${saved.revision}）`, exact: true }).click();
    await page.getByRole('button', { name: 'この版に戻す', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '戻す', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const restored = await client.sheet.builderState.query({ sheetId });
    expect(restored.status).toBe('OK');
    if (restored.status !== 'OK') throw new Error('Restored document missing');
    expect(restored.snapshot).toMatchObject({ title: first.title, blocks: original });
    expect(BigInt(restored.snapshot.revision)).toBe(BigInt(saved.revision) + 1n);

    await page.getByRole('button', { name: '戻す前に戻す', exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '戻す', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const undone = await client.sheet.builderState.query({ sheetId });
    expect(undone.status).toBe('OK');
    if (undone.status !== 'OK') throw new Error('Undo document missing');
    expect(undone.snapshot).toMatchObject({ title: saved.title, blocks: updated });
    expect(BigInt(undone.snapshot.revision)).toBe(BigInt(restored.snapshot.revision) + 1n);
    const beforeConflict = await client.sheet.history.list.query({ sheetId });
    expect(beforeConflict.map((row) => row.revision)).toEqual([
      undone.snapshot.revision,
      restored.snapshot.revision,
      saved.revision,
      first.revision,
    ]);
    await expect(
      client.sheet.history.restore.mutate({
        sheetId,
        targetRevision: first.revision,
        expectedRevision: saved.revision,
        confirmation: stalePreview.confirmation,
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
    expect(await client.sheet.history.list.query({ sheetId })).toEqual(beforeConflict);
    expect(await client.sheet.builderState.query({ sheetId })).toEqual(undone);
    expect(await client.sheet.history.read.query({ sheetId, revision: first.revision })).toMatchObject({
      title: first.title,
      blocks: original,
    });
  } finally {
    const current = await client.sheet.builderState.query({ sheetId });
    if (current.status === 'OK')
      await client.sheet.delete.mutate({ sheetId, expectedRevision: current.snapshot.revision });
  }
});

// #626: 390px の版の履歴は一覧と比較が別画面。帯の記号ボタン（× / ‹）の出し分けとフォーカス、
// 比較画面の帯の題、横にはみ出さないことを実ブラウザで確かめる。
test('390px: 一覧は × 、比較は ‹ と題を出し、フォーカスが移り、横にはみ出さない', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const client = clientFor(page);
  const sheetId = randomUUID();
  const blockId = randomUUID();
  const body = (text: string) => [{ id: blockId, type: 'markdown', order: 0, data: { markdown: text } }];
  const created = await client.sheet.create.mutate({ sheetId, title: 'History 390', blocks: body('v0') });
  try {
    // 自動保存と同じく間を置かずに3回保存する（1つのまとまりになる）。
    let revision = created.revision;
    for (const text of ['v1', 'v2', 'v3']) {
      revision = (
        await client.sheet.save.mutate({
          sheetId,
          expectedRevision: revision,
          title: 'History 390',
          blocks: body(text),
        })
      ).revision;
    }
    await page.goto(`/builder?sheet=${sheetId}`);
    await page.getByRole('button', { name: '版の履歴を開く', exact: true }).click();
    const close = page.getByRole('button', { name: '編集画面へ', exact: true });
    const back = page.getByRole('button', { name: '一覧へ', exact: true });
    const showCompare = page.getByRole('button', { name: /^変更を見る/ });
    const barTitle = page.locator('header').getByText('いまの内容から変わる項目', { exact: true });

    // 一覧: × が見え、‹ と比較の題は見えない。帯の題は「版の履歴」。
    await expect(close).toBeVisible();
    await expect(back).toBeHidden();
    await expect(barTitle).toBeHidden();
    await expect(page.getByRole('heading', { name: '版の履歴', exact: true })).toBeVisible();
    // 板どおり 32px の記号ボタン。当たり判定は ::before を 6px ずつ外へ広げて 44px にする。
    const box = await close.boundingBox();
    expect(box?.width).toBeCloseTo(32, 0);
    expect(box?.height).toBeCloseTo(32, 0);
    expect(await close.evaluate((el) => window.getComputedStyle(el, '::before').top)).toBe('-6px');
    // 「N版 ▾」の開閉タグは見た目 20px のまま、::before を上下 10px 広げて当たり判定を 40px 以上にする。
    const toggle = page.getByRole('button', { name: /の内訳を(開く|閉じる)$/ });
    const toggleBox = await toggle.boundingBox();
    expect(toggleBox?.height).toBeCloseTo(20, 0);
    const before = await toggle.evaluate((el) => {
      const style = window.getComputedStyle(el, '::before');
      return { top: style.top, bottom: style.bottom, position: window.getComputedStyle(el).position };
    });
    expect(before).toEqual({ top: '-10px', bottom: '-10px', position: 'relative' });

    // 「変更を見る」で比較画面へ。‹ と帯の題が出て × は隠れ、フォーカスが ‹ に移る。
    await showCompare.click();
    await expect(back).toBeVisible();
    await expect(close).toBeHidden();
    await expect(barTitle).toBeVisible();
    await expect(page.getByRole('heading', { name: '版の履歴', exact: true })).toBeHidden();
    await expect(back).toBeFocused();

    // ‹ で一覧へ戻る。× が出て、フォーカスは「変更を見る」に戻る。
    await back.click();
    await expect(close).toBeVisible();
    await expect(back).toBeHidden();
    await expect(barTitle).toBeHidden();
    await expect(showCompare).toBeFocused();

    // どちらの画面でも横にはみ出さない。
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBe(0);
    await showCompare.click();
    await expect(back).toBeVisible();
    expect(await overflow()).toBe(0);
  } finally {
    const current = await client.sheet.builderState.query({ sheetId });
    if (current.status === 'OK')
      await client.sheet.delete.mutate({ sheetId, expectedRevision: current.snapshot.revision });
  }
});

// #377: 版の履歴の全体プレビューにも「会社から探す」が出る。ビルダーはシートを ?sheet= で選ぶ。
// 新しいタブで開くリンクがクエリを落とすと既定の別シートの編集画面に着いてしまう。
test('版の履歴の「会社から探す」を新しいタブで開いても同じシートの編集画面が開く', async ({ page }) => {
  await login(page);
  const client = clientFor(page);
  const sheetId = randomUUID();
  const decoyId = randomUUID();
  const blocks = buildRealVolumeDemoBlocks().map((block, order) => ({ ...block, id: randomUUID(), order }));
  const title = `Company jump history ${sheetId}`;
  // クエリの無い /builder は既定のシートを開く。所有者の最初のシートが既定になる。
  // 別のシートを先に作って試すシートが既定にならないようにする。
  await client.sheet.create.mutate({ sheetId: decoyId, title: `Company jump decoy ${decoyId}`, blocks: [] });
  // 既定のシートを先に消すと既定が付け替わる。後片付けは試すシートから消す。
  const cleanup = [decoyId];
  try {
    const created = await client.sheet.create.mutate({ sheetId, title, blocks });
    cleanup.unshift(sheetId);
    // 版を2つにして、比較画面から全体プレビューへ切り替えられるようにする。
    await client.sheet.save.mutate({ sheetId, expectedRevision: created.revision, title: `${title} v2`, blocks });
    const expectedSwitcher = `シートを切り替える: ${title} v2`;

    // 前提: クエリの無い /builder は別のシートを開く。これが崩れると下の確認は何も見分けない。
    await page.goto('/builder', { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: /^シートを切り替える:/ })).not.toHaveAccessibleName(expectedSwitcher);

    await page.goto(`/builder?sheet=${sheetId}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '版の履歴を開く', exact: true }).click();
    await page.getByRole('button', { name: '選択した版の全体プレビュー', exact: true }).click();
    const jumpNav = page.getByRole('navigation', { name: '会社別ジャンプ' }).first();
    await jumpNav.getByText('会社から探す').click();
    const chip = jumpNav.getByRole('link').first();
    await expect(chip).toHaveAttribute('href', new RegExp(`^/builder\\?sheet=${sheetId}#company-`));

    // 中クリック・Cmd+クリックと同じく、修飾キー付きのクリックで新しいタブに開く。
    const [tab] = await Promise.all([
      page.context().waitForEvent('page'),
      chip.click({ modifiers: ['ControlOrMeta'] }),
    ]);
    try {
      await tab.waitForLoadState('networkidle');
      expect(new URL(tab.url()).searchParams.get('sheet')).toBe(sheetId);
      // WHY: 新しいタブはアプリ起動とシート取得をまるごとやり直す。
      // 既定の expect 5 秒では CI 負荷下で切替ボタンが描画前に切られる。
      // ポップアップの初回遷移は Playwright が pending 扱いのまま commit を取りこぼす
      // ことがあり、描画済みでも expect が navigation 待ちで 30 秒止まる。
      // DOM ポーリングなら遷移の帳簿に影響されずスイッチャー名を確認できる。
      await tab.waitForFunction(
        (expected) =>
          [...document.querySelectorAll('button[aria-label^="シートを切り替える:"]')].some(
            (button) => button.getAttribute('aria-label') === expected,
          ),
        expectedSwitcher,
        { timeout: 30_000 },
      );
    } finally {
      await tab.close();
    }
    // 元のタブは移動しない。
    expect(new URL(page.url()).searchParams.get('sheet')).toBe(sheetId);
  } finally {
    for (const id of cleanup) {
      const current = await client.sheet.builderState.query({ sheetId: id });
      if (current.status === 'OK')
        await client.sheet.delete.mutate({ sheetId: id, expectedRevision: current.snapshot.revision });
    }
  }
});
