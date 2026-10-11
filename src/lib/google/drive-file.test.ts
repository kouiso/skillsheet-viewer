import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DriveUploadError,
  driveFailureMessage,
  formatDriveFileName,
  isDriveAuthExpired,
  uploadDriveFile,
} from './drive-file';

/** Drive のエラー応答 JSON を返す Response を作る。 */
function errorResponse(status: number, reason: string | null): Response {
  return new Response(JSON.stringify({ error: { code: status, errors: reason ? [{ reason }] : [] } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('uploadDriveFile', () => {
  it('共有ドライブへも保存できるよう supportsAllDrives=true を必ず付ける', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'file-1', webViewLink: 'https://drive/x' }), { status: 200 }),
      );

    await uploadDriveFile({
      accessToken: 'token',
      folderId: 'folder-1',
      name: 'シート.pdf',
      blob: new Blob(['x'], { type: 'application/pdf' }),
      mimeType: 'application/pdf',
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('supportsAllDrives=true');
    expect(url).toContain('uploadType=multipart');
    expect(url).toContain('upload/drive/v3/files');
    // 同名は上書きせず常に新規ファイル — PUT（PATCH/更新）ではなく POST の files.create。
    expect(init.method).toBe('POST');
  });

  it('エラー応答の reason を DriveUploadError へ写す', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(errorResponse(404, 'notFound'));
    const err = await uploadDriveFile({
      accessToken: 't',
      folderId: 'gone',
      name: 'a.pdf',
      blob: new Blob(['x']),
      mimeType: 'application/pdf',
    }).catch((e) => e);
    expect(err).toBeInstanceOf(DriveUploadError);
    expect((err as DriveUploadError).reason).toBe('notFound');
  });

  it('応答が想定外の JSON でも黙らず例外にする', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await expect(
      uploadDriveFile({
        accessToken: 't',
        folderId: 'f',
        name: 'a.pdf',
        blob: new Blob(['x']),
        mimeType: 'application/pdf',
      }),
    ).rejects.toBeInstanceOf(DriveUploadError);
  });
});

describe('driveFailureMessage（reason ごとの案内）', () => {
  const cases: Array<[string | null, number, string]> = [
    ['notFound', 404, '保存先が見つかりません。保存先を選び直してください'],
    ['storageQuotaExceeded', 507, 'Drive の容量が足りません'],
    ['userRateLimitExceeded', 403, '少し待ってからもう一度押してください'],
    ['rateLimitExceeded', 403, '少し待ってからもう一度押してください'],
    ['domainPolicy', 403, '組織の設定で禁止されています'],
    ['whatever', 401, 'Google への接続が切れました。もう一度押してください'],
    ['unknownReason', 500, 'Drive への保存に失敗しました'],
  ];
  it.each(cases)('reason=%s status=%i → %s', (reason, status, message) => {
    expect(driveFailureMessage(new DriveUploadError(reason, status, 'x'))).toBe(message);
  });

  it('DriveUploadError 以外は汎用メッセージ', () => {
    expect(driveFailureMessage(new TypeError('Network failed'))).toBe('Drive への保存に失敗しました');
  });

  it('401 を isDriveAuthExpired で判別する', () => {
    expect(isDriveAuthExpired(new DriveUploadError(null, 401, 'x'))).toBe(true);
    expect(isDriveAuthExpired(new DriveUploadError('notFound', 404, 'x'))).toBe(false);
  });
});

describe('formatDriveFileName', () => {
  it('タイトル_YYYY-MM-DD_HHmm を Asia/Tokyo 固定で組み立てる', () => {
    const now = new Date('2026-10-11T15:18:00Z');
    expect(formatDriveFileName('スキルシート', 'pdf', now)).toBe('スキルシート_2026-10-12_0018.pdf');
  });

  it('要約版タイトルをそのまま受け取り拡張子だけ変える', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(formatDriveFileName('要約', 'xlsx', now)).toBe('要約_2026-06-01_0900.xlsx');
  });
});
