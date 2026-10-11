import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';
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
    await page.getByText(`版 ${first.revision}`, { exact: true }).click();
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
