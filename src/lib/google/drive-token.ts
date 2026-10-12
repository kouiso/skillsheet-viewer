/**
 * Google Identity Services（GIS）の token client を包み、
 * Drive API 用のアクセストークンを受け取る。
 *
 * 権限は drive.file のみ（このアプリが作ったファイルと、
 * Google Picker で選ばれたファイル/フォルダにしか触れない非機密スコープ）。
 * トークンの有効期限は 1 時間。期限の 1 分前までは取得済みトークンを使い回し、
 * 再取得が要るときだけポップアップを出す。
 *
 * 重要: requestAccessToken はユーザーのクリックと同期的に呼ぶこと。
 * await を挟むとブラウザのポップアップブロッカーに止められる
 * （issue #384 §1「押した直後、何も待たずに要求する」）。
 * 小窓を閉じた・開けなかった場合は error_callback、同意を断った場合は
 * 通常の callback に error が入る。どちらでも「保存中」の表示を戻せるよう
 * reject し、Sentry には送らない想定の失敗として扱う。
 */

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** 期限切れ判定をこの時間だけ早める（API 往復中の失効を吸収する）。 */
const TOKEN_EXPIRY_SKEW_MS = 60_000;

/** GIS の token client が受け取る成功応答のうち、使う部分だけの型。 */
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
  error_uri?: string;
}

interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
  error_callback?: (error: { type?: string; message?: string }) => void;
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

interface GoogleAccounts {
  accounts: {
    oauth2: {
      initTokenClient: (config: TokenClientConfig) => TokenClient;
    };
  };
}

function googleAccounts(): GoogleAccounts | undefined {
  return (globalThis as { google?: GoogleAccounts }).google;
}

/** ポップアップを閉じた・同意を断った等の「ユーザー由来の中断」。Sentry には送らない。 */
export class DriveAuthCancelledError extends Error {
  constructor(reason: string) {
    super(`Google ログインが完了しませんでした: ${reason}`);
    this.name = 'DriveAuthCancelledError';
  }
}

/** GIS スクリプト未読み込み等、環境側の失敗。 */
export class DriveAuthUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriveAuthUnavailableError';
  }
}

export interface DriveTokenSource {
  /** 有効なトークンを返す。期限が近い・未取得ならポップアップで取得する。 */
  ensureToken: () => Promise<string>;
  /** 401 を受けたときに呼び、保持トークンを捨てて次回は再取得にする。 */
  invalidate: () => void;
}

export function createDriveTokenSource(clientId: string): DriveTokenSource {
  let cached: { token: string; expiresAt: number } | null = null;
  let inFlight: Promise<string> | null = null;
  let tokenClient: TokenClient | null = null;
  // initTokenClient のコールバックは一度しか登録しないため、どの要求に答えるかを
  // pending で引き継ぐ。登録コールバックに Promise の resolve を直接閉じ込めると
  // 2 回目以降の要求が最初の Promise に吸われて解決しない（実測で 5 秒タイムアウト）。
  let pending: { resolve: (token: string) => void; reject: (err: Error) => void } | null = null;

  const requestNewToken = (): Promise<string> => {
    // 同時押しでポップアップを二重に開かないよう、進行中の要求を共有する。
    if (inFlight) return inFlight;

    inFlight = new Promise<string>((resolve, reject) => {
      const google = googleAccounts();
      if (!google) {
        reject(new DriveAuthUnavailableError('Google のログインスクリプトがまだ読み込まれていません'));
        return;
      }
      pending = { resolve, reject };
      if (!tokenClient) {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: DRIVE_FILE_SCOPE,
          callback: (response) => {
            const current = pending;
            pending = null;
            if (!current) return;
            if (response.error || !response.access_token) {
              // 同意を断った等。callback 側に error が来る経路。
              current.reject(new DriveAuthCancelledError(response.error ?? 'no_access_token'));
              return;
            }
            const expiresIn = typeof response.expires_in === 'number' ? response.expires_in : 3600;
            cached = {
              token: response.access_token,
              expiresAt: Date.now() + expiresIn * 1000,
            };
            current.resolve(response.access_token);
          },
          error_callback: (error) => {
            // 小窓を閉じた（popup_closed）・開けなかった（popup_failed_to_open）。
            const current = pending;
            pending = null;
            current?.reject(new DriveAuthCancelledError(error.type ?? 'unknown'));
          },
        });
      }
      try {
        // prompt:'' は同意済みセッションなら小窓を出さず即時返す。
        // クリックと同期的に呼ぶこと（ポップアップブロッカー対策）。
        tokenClient.requestAccessToken({ prompt: '' });
      } catch (err) {
        pending = null;
        inFlight = null;
        throw err;
      }
    }).finally(() => {
      inFlight = null;
    });

    return inFlight;
  };

  return {
    ensureToken: () => {
      if (cached && cached.expiresAt - TOKEN_EXPIRY_SKEW_MS > Date.now()) {
        return Promise.resolve(cached.token);
      }
      return requestNewToken();
    },
    invalidate: () => {
      cached = null;
    },
  };
}
