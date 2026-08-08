import fs from 'node:fs';
import path from 'node:path';
import { expect, test as setup } from '@playwright/test';
import { authFile, login } from './auth';

setup('編集者ログイン', async ({ page }) => {
  await fs.promises.mkdir(path.dirname(authFile), { recursive: true });

  await login(page);
  await expect(page).toHaveURL('/builder');

  await page.context().storageState({ path: authFile });
});
