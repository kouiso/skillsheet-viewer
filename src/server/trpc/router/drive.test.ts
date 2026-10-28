import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// DB 層は実 DB を使わず mock — router の認可と env ゲートだけを見る（#384）。
const readDriveDestination = vi.hoisted(() => vi.fn());
const saveDriveDestination = vi.hoisted(() => vi.fn());
const clearDriveDestination = vi.hoisted(() => vi.fn());
vi.mock('@/db/drive-destination', () => ({ readDriveDestination, saveDriveDestination, clearDriveDestination }));
vi.mock('@/db', () => ({
  getDb: () => ({}),
  getOwnerId: () => 'owner-1',
}));

import { createCallerFactory } from '../init';
import { createTestContext } from '../test-context';
import { driveRouter } from './drive';

const createCaller = createCallerFactory(driveRouter);

function callerWith(editorUserId: string | null) {
  return createCaller(createTestContext({ editorUserId, isViewer: true, request: null, responseHeaders: null }));
}

const GOOGLE_ENV = {
  GOOGLE_DRIVE_CLIENT_ID: 'cid.apps.googleusercontent.com',
  GOOGLE_PICKER_API_KEY: 'picker-key',
  GOOGLE_CLOUD_PROJECT_NUMBER: '12345',
};

function stubGoogleEnv() {
  vi.stubEnv('GOOGLE_DRIVE_CLIENT_ID', GOOGLE_ENV.GOOGLE_DRIVE_CLIENT_ID);
  vi.stubEnv('GOOGLE_PICKER_API_KEY', GOOGLE_ENV.GOOGLE_PICKER_API_KEY);
  vi.stubEnv('GOOGLE_CLOUD_PROJECT_NUMBER', GOOGLE_ENV.GOOGLE_CLOUD_PROJECT_NUMBER);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('drive router の認可（オーナー専用）', () => {
  it('未ログイン（編集者でない）呼び出しは UNAUTHORIZED を返す', async () => {
    stubGoogleEnv();
    const caller = callerWith(null);
    await expect(caller.setting()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller.setDestination({ folderId: 'f', folderName: 'n' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(caller.clearDestination()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    // オーナーでなければ DB へも届かない。
    expect(readDriveDestination).not.toHaveBeenCalled();
    expect(saveDriveDestination).not.toHaveBeenCalled();
  });
});

describe('drive.setting', () => {
  it('Google の 3 環境変数が揃っていなければ enabled:false で機能を隠す', async () => {
    const caller = callerWith('owner-1');
    await expect(caller.setting()).resolves.toEqual({ enabled: false });
    expect(readDriveDestination).not.toHaveBeenCalled();
  });

  it('揃っていればクライアント設定と保存先（未設定なら null）を返す', async () => {
    stubGoogleEnv();
    readDriveDestination.mockResolvedValue(null);
    const caller = callerWith('owner-1');
    await expect(caller.setting()).resolves.toEqual({
      enabled: true,
      client: {
        clientId: GOOGLE_ENV.GOOGLE_DRIVE_CLIENT_ID,
        pickerApiKey: GOOGLE_ENV.GOOGLE_PICKER_API_KEY,
        appId: '12345',
      },
      destination: null,
    });
  });

  it('保存先があれば id と選択時の名前を返す', async () => {
    stubGoogleEnv();
    readDriveDestination.mockResolvedValue({ folderId: 'folder-1', folderName: '提出用' });
    const caller = callerWith('owner-1');
    await expect(caller.setting()).resolves.toMatchObject({
      enabled: true,
      destination: { folderId: 'folder-1', folderName: '提出用' },
    });
  });

  it('DB の失敗は握りつぶさず伝播する（権限の付け忘れを「未設定」と間違えない）', async () => {
    stubGoogleEnv();
    readDriveDestination.mockRejectedValue(new Error('permission denied'));
    const caller = callerWith('owner-1');
    await expect(caller.setting()).rejects.toThrow('permission denied');
  });
});

describe('drive.setDestination / clearDestination', () => {
  it('オーナーは保存先を記録できる', async () => {
    stubGoogleEnv();
    const caller = callerWith('owner-1');
    await expect(caller.setDestination({ folderId: 'f-1', folderName: 'フォルダA' })).resolves.toEqual({ ok: true });
    expect(saveDriveDestination).toHaveBeenCalledWith('owner-1', { folderId: 'f-1', folderName: 'フォルダA' });
  });

  it('folderId が空なら zod で弾く', async () => {
    stubGoogleEnv();
    const caller = callerWith('owner-1');
    await expect(caller.setDestination({ folderId: '', folderName: 'x' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(saveDriveDestination).not.toHaveBeenCalled();
  });

  it('オーナーは保存先を消せる', async () => {
    stubGoogleEnv();
    const caller = callerWith('owner-1');
    await expect(caller.clearDestination()).resolves.toEqual({ ok: true });
    expect(clearDriveDestination).toHaveBeenCalledWith('owner-1');
  });
});
