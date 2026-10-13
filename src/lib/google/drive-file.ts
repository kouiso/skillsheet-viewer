import { z } from 'zod';

/**
 * Drive API への直接アップロード（ブラウザ → Google、サーバーは通らない）。
 * 5MB 以下のファイルは multipart/related で 1 回の POST で送る。
 * 共有ドライブ配下のフォルダへも保存できるよう、すべての呼び出しに
 * supportsAllDrives=true を付ける。
 */

export interface UploadedDriveFile {
  id: string;
  /** トーストの「開く」リンクに使う URL。 */
  webViewLink: string | null;
}

/** Drive の作成応答。想定外の形は握りつぶさず zod で弾く。 */
const driveFileSchema = z.object({
  id: z.string(),
  webViewLink: z.string().optional(),
});

/** Drive のエラー応答。案内は HTTP 番号ではなく reason で分ける（issue #384 §8）。 */
const driveErrorSchema = z.object({
  error: z.object({
    code: z.number().optional(),
    errors: z.array(z.object({ reason: z.string().optional() }).loose()).optional(),
  }),
});

export class DriveUploadError extends Error {
  readonly reason: string | null;
  readonly status: number;
  constructor(reason: string | null, status: number, message: string) {
    super(message);
    this.name = 'DriveUploadError';
    this.reason = reason;
    this.status = status;
  }
}

/** reason → 画面の案内。表に無い理由は汎用メッセージに畳む。 */
export function driveFailureMessage(err: unknown): string {
  if (err instanceof DriveUploadError) {
    switch (err.reason) {
      case 'notFound':
        return '保存先が見つかりません。保存先を選び直してください';
      case 'storageQuotaExceeded':
        return 'Drive の容量が足りません';
      case 'userRateLimitExceeded':
      case 'rateLimitExceeded':
        return '少し待ってからもう一度押してください';
      case 'domainPolicy':
        return '組織の設定で禁止されています';
      default:
        break;
    }
    if (err.status === 401) {
      return 'Google への接続が切れました。もう一度押してください';
    }
  }
  return 'Drive への保存に失敗しました';
}

/** 401 のとき true。呼び出し側は保持トークンを捨てて再試行を促す。 */
export function isDriveAuthExpired(err: unknown): boolean {
  return err instanceof DriveUploadError && err.status === 401;
}

const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

/**
 * multipart/related で新規ファイルを作る。
 * 同名ファイルがあっても上書きはしない — Drive は同名を許すため
 * 毎回新しいファイルとして保存される（issue #384 完成条件）。
 */
export async function uploadDriveFile(input: {
  accessToken: string;
  folderId: string;
  name: string;
  blob: Blob;
  mimeType: string;
}): Promise<UploadedDriveFile> {
  const boundary = `skillsheet-drive-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name: input.name, parents: [input.folderId] });
  const body = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`,
      input.blob,
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` },
  );

  const res = await fetch(`${UPLOAD_URL}?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.accessToken}` },
    body,
  });

  if (!res.ok) {
    let reason: string | null = null;
    try {
      const parsed = driveErrorSchema.safeParse(await res.json());
      reason = parsed.success ? (parsed.data.error.errors?.[0]?.reason ?? null) : null;
    } catch {
      // 応答が JSON でない（プロキシの HTML 等）は reason なしで扱う。
    }
    throw new DriveUploadError(reason, res.status, `Drive upload failed: HTTP ${res.status}`);
  }

  const parsed = driveFileSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new DriveUploadError(null, res.status, 'Drive upload failed: unexpected response');
  }
  return { id: parsed.data.id, webViewLink: parsed.data.webViewLink ?? null };
}

/**
 * Drive 保存用のファイル名 `<タイトル>_YYYY-MM-DD_HHmm.<ext>` を作る。
 * 時刻は Asia/Tokyo 固定 — 端末のタイムゾーンに左右させない。
 * 同じ分に 2 回保存すると同名ファイルが 2 つできるが、Drive は同名を許すので
 * そのままにする（issue #384 §3）。
 */
export function formatDriveFileName(title: string, extension: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  // hour12:false でも環境によって深夜 0 時が "24" と出るため正規化する。
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${title}_${get('year')}-${get('month')}-${get('day')}_${hour}${get('minute')}.${extension}`;
}
