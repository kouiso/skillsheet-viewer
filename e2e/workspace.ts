import { expect, type Page } from '@playwright/test';

/** 新規作成は常設のシート切替から開く。メニューとダイアログを混同しない。 */
export async function openCreateSheet(page: Page) {
  await page.getByRole('button', { name: /^シートを切り替える:/ }).click();
  await page.getByRole('button', { name: '新しいシートを作る…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '新規シートを作成' })).toBeVisible();
}

export async function chooseTemplate(page: Page, id: 'full' | 'console-dashboard' | 'blank') {
  await page
    .getByRole('dialog', { name: '新規シートを作成' })
    .locator(`input[name="sheet-template"][value="${id}"]`)
    .check();
}

/** レール/ドロワーの複製を除き、実際に操作可能なアウトラインから選ぶ。 */
export async function selectBlock(page: Page, kind: string) {
  const item = page
    .locator('nav[aria-label="ブロック一覧"]:visible')
    .getByRole('button', { name: new RegExp(`^${kind}:`) })
    .first();
  await item.click();
}

export async function addBlock(page: Page, label: string) {
  await page.getByRole('button', { name: 'ブロックを追加', exact: true }).click();
  await page
    .locator('[data-radix-popper-content-wrapper]')
    .getByRole('button', { name: label, exact: true })
    .and(page.locator('button:not([aria-roledescription="draggable"])'))
    .click();
}
