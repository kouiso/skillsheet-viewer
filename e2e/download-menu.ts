import type { Page } from '@playwright/test';

/**
 * ビューアトップバーの「ダウンロード」メニュー（Popover）を開いて指定項目を押す。
 * #397 でデスクトップの出力系も Popover 化されたため、項目はトリガーを開いた時だけ
 * 押せる。SP の compact 表示も同じトリガー名「ダウンロード」なのでこの手順で共通。
 * 非表示側（sm:hidden / hidden sm:flex）は a11y ツリーに出ないため exact で一意に取れる。
 */
export async function clickDownloadMenuItem(page: Page, itemName: string) {
  await page.getByRole('button', { name: 'ダウンロード', exact: true }).click();
  await page.getByRole('button', { name: itemName, exact: true }).click();
}
