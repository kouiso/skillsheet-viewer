import { test as setup } from '@playwright/test';
import { login } from './auth';

// 以降の E2E テストで storageState として共有する認証状態を 1 回だけ取得する。
// 毎テストで sign-in を繰り返すと Better Auth のレートリミットに到達するため、
// ログイン後に生成された cookie を playwright/.auth/user.json に保存して使い回す。
setup('authenticate', async ({ page }) => {
  await login(page);
});
