/**
 * サーバー環境変数のフェイルファスト検証。
 *
 * 必須（欠けると致命的）:
 *   DATABASE_URL          — Neon選択時のPostgres接続文字列
 *   D1_GATEWAY_URL / D1_GATEWAY_SERVICE_TOKEN / BETTER_AUTH_URL — D1選択時の共通接続境界
 *   SESSION_SECRET        — 閲覧用 HMAC セッション署名鍵
 *   VIEWER_CODE           — 閲覧用ログインコード
 *   BETTER_AUTH_SECRET    — 編集者ログイン（Better Auth）の署名鍵
 *   SKILLSHEET_OWNER_ID   — 表示対象スキルシートのオーナー id
 *
 * 任意（GitHub 読み取りの副系統でのみ必要）:
 *   GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO  — 欠けても throw せず warn のみ
 *
 * 任意（Google Drive 保存。warn も出さない）:
 *   GOOGLE_DRIVE_CLIENT_ID / GOOGLE_PICKER_API_KEY / GOOGLE_CLOUD_PROJECT_NUMBER
 *   — 3つ揃った環境でのみ Drive 保存を有効にする（tRPC drive.setting が返す）。
 *     NEXT_PUBLIC_ にしない — オーナーだけが使う値なので router 経由で渡す（#384）。
 *
 * Server-only. Never import from Client Components.
 */

const REQUIRED_SERVER_ENV = [
  'DATABASE_URL',
  'SESSION_SECRET',
  'VIEWER_CODE',
  'BETTER_AUTH_SECRET',
  'SKILLSHEET_OWNER_ID',
] as const;

// GitHub 読み取りは副系統。揃っていなくても致命的ではないので warn 止まり。
const OPTIONAL_GITHUB_ENV = ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'] as const;

// 設定不備由来のエラーを classifyConfigError() とは別経路で判定するための文言プレフィックス。
// assertServerEnv() の throw 文言と一字一句一致させること（observability 側の設定不備フィルタが依存する）。
export const MISSING_SERVER_ENV_PREFIX = '必須のサーバー環境変数が設定されていません';

// `next build` の静的解析フェーズでは secrets が無いのが正常なので検証しない。
// （Vercel ビルド等で secrets 未注入のまま import されても落とさない）
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build';
}

let validated = false;

/**
 * 必須サーバー環境変数が揃っているか検証する。
 * - 欠けている必須変数があれば、全て列挙した 1 つの明確なエラーで throw する。
 * - GitHub 系の任意変数が欠けている場合は console.warn のみ（throw しない）。
 * - 一度成功したら以降は no-op（冪等・低コスト）。
 * - ビルドフェーズ中は no-op（secrets 不在でビルドを壊さない）。
 */
export function assertServerEnv(): void {
  if (validated) return;
  if (isBuildPhase()) return;

  const required: readonly string[] =
    process.env.SKILLSHEET_DB_BACKEND === 'd1'
      ? [
          ...REQUIRED_SERVER_ENV.filter((key) => key !== 'DATABASE_URL'),
          'D1_GATEWAY_URL',
          'D1_GATEWAY_SERVICE_TOKEN',
          'BETTER_AUTH_URL',
        ]
      : REQUIRED_SERVER_ENV;
  const missing = required.filter((key) => {
    const value = process.env[key];
    return value === undefined || value === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `必須のサーバー環境変数が設定されていません: ${missing.join(', ')}。` +
        ` これらを設定してから起動してください（必須: ${required.join(', ')}）。`,
    );
  }

  const missingGithub = OPTIONAL_GITHUB_ENV.filter((key) => {
    const value = process.env[key];
    return value === undefined || value === '';
  });

  if (missingGithub.length > 0) {
    console.warn(
      `[env] GitHub 読み取り用の任意環境変数が未設定です: ${missingGithub.join(', ')}。` +
        ' GitHub 経由の読み取り副系統は無効になります（DB 経由の表示には影響しません）。',
    );
  }

  validated = true;
}
