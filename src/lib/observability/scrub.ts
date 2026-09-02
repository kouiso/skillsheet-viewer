/**
 * SDK 非依存の純関数群。Sentry / PostHog どちらの型にも依存しない
 * （テストがベンダー SDK 無しで完結し、将来ベンダーを替えても流用できる）。
 */

const KNOWN_ROUTES: ReadonlyArray<{ name: RouteName; test: (path: string) => boolean }> = [
  { name: 'home', test: (p) => p === '/' },
  { name: 'view-db-sheet', test: (p) => /^\/view\/db\/[^/]+\/?$/u.test(p) },
  { name: 'view-db-index', test: (p) => /^\/view\/db\/?$/u.test(p) },
  { name: 'view-sheet', test: (p) => /^\/view\/[^/]+\/?$/u.test(p) },
  { name: 'view-index', test: (p) => /^\/view\/?$/u.test(p) },
  { name: 'viewer-auth', test: (p) => /^\/viewer-auth\/?$/u.test(p) },
  { name: 'login', test: (p) => /^\/login\/?$/u.test(p) },
  { name: 'builder-preview', test: (p) => /^\/builder\/preview\/?$/u.test(p) },
  { name: 'builder', test: (p) => /^\/builder\/?$/u.test(p) },
  { name: 'api-auth', test: (p) => /^\/api\/auth(\/.*)?$/u.test(p) },
  { name: 'api-logout', test: (p) => /^\/api\/logout\/?$/u.test(p) },
  { name: 'api-revalidate', test: (p) => /^\/api\/revalidate\/?$/u.test(p) },
  { name: 'api-trpc', test: (p) => /^\/api\/trpc(\/.*)?$/u.test(p) },
];

export type RouteName =
  | 'home'
  | 'view-index'
  | 'view-sheet'
  | 'view-db-index'
  | 'view-db-sheet'
  | 'viewer-auth'
  | 'login'
  | 'builder'
  | 'builder-preview'
  | 'api-auth'
  | 'api-logout'
  | 'api-revalidate'
  | 'api-trpc'
  | 'other';

/**
 * パスを既知ルートの enum に丸める。既知ルートへのマッピングのみを持ち、
 * 未知のパスは無条件で `'other'` にする（除外パターンの正規表現だと、
 * 想定していないパス — まさにシート名を含む動的セグメント — がそのまま漏れる）。
 */
export function toRouteName(pathname: string): RouteName {
  let path: string;
  try {
    path = pathname.startsWith('/') ? pathname : new URL(pathname).pathname;
  } catch {
    return 'other';
  }
  const match = KNOWN_ROUTES.find((r) => r.test(path));
  return match?.name ?? 'other';
}

const MARKDOWN_FILENAME_PATTERN = /[^\s/]+\.md\b/giu;
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/gu;
// 32文字以上の英数字/ハイフン/ドット/アンダースコア連続はトークン・ハッシュ・署名とみなす。
const LONG_TOKEN_PATTERN = /[A-Za-z0-9_.-]{32,}/gu;
// http(s) URL はクエリ文字列（閲覧コード等）や動的セグメント（シート名）を運びうるので、
// ルート名 enum の placeholder に丸める（ファイル名 replace 等より先に、まるごと1回で処理する）。
const URL_PATTERN = /https?:\/\/[^\s"'<>)]+/giu;
// Drizzle の `DrizzleQueryError` は `Failed query: <sql>\nparams: <値>` という形式で、
// params 以降に職務経歴書の本文（会社名・案件名等）がそのまま入る。SQL 本体はプレースホルダ
// （$1, $2 ...）だけで実データを持たないため、params 以降だけを丸ごと落とす。
const DRIZZLE_PARAMS_PATTERN = /\bparams:[\s\S]*$/u;
const MAX_LENGTH = 300;

/**
 * 自由記述文字列（エラーメッセージ等）から DB クエリパラメータ・URL・ファイル名・UUID・
 * メールアドレス・長いトークンを潰し、300字で切る。イベントの enum フィールドではなく、
 * Sentry の message/value 等 SDK が自動で埋める自由記述部にだけ使う最終防衛line。
 */
export function redactFreeText(input: string): string {
  const redacted = input
    .replace(DRIZZLE_PARAMS_PATTERN, 'params: [redacted]')
    .replace(URL_PATTERN, (url) => toRoutePlaceholder(url))
    .replace(MARKDOWN_FILENAME_PATTERN, '[redacted.md]')
    .replace(UUID_PATTERN, '[redacted-uuid]')
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(LONG_TOKEN_PATTERN, '[redacted-token]');
  return redacted.length > MAX_LENGTH ? `${redacted.slice(0, MAX_LENGTH)}…` : redacted;
}

/**
 * Sentry の実 Event 型を import せず、必要なフィールドだけの構造的部分型で受ける。
 * `@sentry/nextjs` を追加する前（step1）でもコンパイルできるようにするため。
 * 実際の `Sentry.Event` はこの部分型のスーパーセットなので、そのまま渡せる。
 */
export interface ScrubbableSentryEvent {
  message?: string;
  request?: {
    url?: string;
    query_string?: unknown;
    cookies?: unknown;
    headers?: unknown;
  };
  // 実 Sentry の Contexts 型は「全プロパティ任意の辞書型」で `nextjs` を静的に知らないため、
  // 構造的部分型としてそのまま渡すと TS の weak-type チェックに弾かれる。辞書として受け、
  // 中の読み書きだけ nextjs の形を仮定する（scrubSentryEvent 内でのみ行う）。
  contexts?: Record<string, unknown>;
  exception?: {
    values?: Array<{ value?: string }>;
  };
  user?: unknown;
  breadcrumbs?: ScrubbableBreadcrumb[];
}

export interface ScrubbableBreadcrumb {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
}

function toRoutePlaceholder(rawUrl: string): string {
  return `/[route:${toRouteName(rawUrl)}]`;
}

const ROUTE_LIKE_KEYS = new Set(['to', 'from', 'url']);

/**
 * breadcrumb.data の値を再帰的に潰す。XHR/fetch breadcrumb 等はネストした object/array で
 * 実データ（URL・レスポンス本文の断片）を運びうるため、トップレベルの文字列だけでは足りない。
 */
function scrubValue(key: string, value: unknown): unknown {
  if (typeof value === 'string') {
    return ROUTE_LIKE_KEYS.has(key) ? toRoutePlaceholder(value) : redactFreeText(value);
  }
  if (Array.isArray(value)) {
    return value.map((v) => scrubValue(key, v));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubValue(k, v)]));
  }
  return value;
}

/**
 * サーバー breadcrumb（GitHub の URL・シートファイル名を含みうる）とクライアント
 * breadcrumb（history の to/from）の両方に効く最終防衛line。個別の integration 設定
 * （httpIntegration({breadcrumbs:false}) 等）が主防御で、これは二重化。
 */
export function scrubBreadcrumb(breadcrumb: ScrubbableBreadcrumb): ScrubbableBreadcrumb {
  const next: ScrubbableBreadcrumb = { ...breadcrumb };
  if (typeof next.message === 'string') {
    next.message = redactFreeText(next.message);
  }
  if (next.data && typeof next.data === 'object') {
    next.data = Object.fromEntries(Object.entries(next.data).map(([k, v]) => [k, scrubValue(k, v)]));
  }
  return next;
}

/**
 * PII の最終防衛line。個々の integration 設定・breadcrumb 無効化が主防御で、
 * これは「それでも漏れたら」を潰す二重化。request のユーザー識別情報は丸ごと落とす。
 */
export function scrubSentryEvent(event: ScrubbableSentryEvent): ScrubbableSentryEvent {
  const next: ScrubbableSentryEvent = { ...event };

  if (typeof next.message === 'string') {
    next.message = redactFreeText(next.message);
  }

  if (next.request) {
    const { url } = next.request;
    next.request = {
      url: typeof url === 'string' ? toRoutePlaceholder(url) : undefined,
      // query string・cookie・header は識別情報の塊なので丸ごと落とす。
    };
  }

  const nextjsContext = next.contexts?.nextjs as { request_path?: string } | undefined;
  if (typeof nextjsContext?.request_path === 'string') {
    next.contexts = {
      ...next.contexts,
      nextjs: { ...nextjsContext, request_path: toRoutePlaceholder(nextjsContext.request_path) },
    };
  }

  if (next.exception?.values) {
    next.exception = {
      ...next.exception,
      values: next.exception.values.map((v) =>
        typeof v.value === 'string' ? { ...v, value: redactFreeText(v.value) } : v,
      ),
    };
  }

  if ('user' in next) {
    next.user = undefined;
  }

  if (next.breadcrumbs) {
    next.breadcrumbs = next.breadcrumbs.map(scrubBreadcrumb);
  }

  return next;
}
