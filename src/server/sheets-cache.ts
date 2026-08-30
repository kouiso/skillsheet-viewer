// クライアントバンドルに巻き込まれた瞬間にビルドを失敗させる。
// これまでは「Client Component から import しないこと」というコメントだけが頼りで、
// 誤って読み込んでも誰も気づけなかった（秘密情報の露出・巨大ドライバの同梱に直結する）。
// DB / GitHub 取得のキャッシュ層。
import 'server-only';

import { unstable_cache } from 'next/cache';
import { listSheets as dbListSheets, getSkillSheet, getSkillSheetById, SkillSheetNotFoundError } from '@/db';

import { fetchSheetFile, listSheets as githubListSheets } from '@/server/github-sheets';

// DB 正本経路（getCachedDbSheetById / getCachedDbSheet）の revalidate 間隔（秒）。
const DB_REVALIDATE_SECONDS = 60;

// unstable_cache の stale-while-revalidate は、バックグラウンドの再検証（revalidate）が
// 失敗しても呼び出し元へは伝播せず、それまでキャッシュ済みの古い値をそのまま返し続ける。
// 再検証の失敗自体は Next.js が内部でログへ残すが、応答（画面）からはそれと分からない
// （Issue #204: DB に繋がらなくなっても /view 系が 200 のまま古い内容を返し続け、
// キャッシュが空のとき（初回・.next 丸ごと削除後）だけ 500 になる、という気付きにくい形）。
//
// 取得できた時刻をキャッシュされる値そのものに同梱しておけば、古い値が再度返された
// ときにも「いつ時点の内容か」を応答から判定できる —— はずだったが、実測でこの前提が
// 崩れていた。unstable_cache の再検証はアクセスがあって初めて発火するため、閲覧頻度が
// 週に数回程度のシートでは、DB が健全でも「しばらく見られていなかった」だけでこの
// しきい値を超え、静かな期間明けの最初の 1 件に誤ってバナーが出る。リロードすると消える
// のは、その 1 件目のリクエスト自身が発火させたバックグラウンド再検証がその時点で
// 完了しているだけで、健全性を確認できたからではない（つまり最初に見た人にだけ出て、
// 見せた本人には二度と見えない誤警報）。
//
// fetchedAt の経過時間だけでは「失敗している」と「アクセスが無く更新機会がなかった」を
// 区別できないため、しきい値を超えて古いときは「疑わしいので直接問い合わせて確認する」
// トリガーとしてのみ使う（下記 withDbHealthCheck 参照）。画面に出す stale は、その場で
// 行う DB への直接問い合わせが実際に失敗した（＝読めなかった）ときだけ true にする。
const DB_STALE_THRESHOLD_MS = DB_REVALIDATE_SECONDS * 3 * 1000;

/** fetchedAt が DB_STALE_THRESHOLD_MS より古い＝直接問い合わせて健全性を確認すべきほど古いか。 */
export function isDbContentStale(fetchedAt: number): boolean {
  return Date.now() - fetchedAt > DB_STALE_THRESHOLD_MS;
}

// 直接問い合わせ（withDbHealthCheck）が固まったまま返らないと、静かな期間明けの
// 最初の閲覧者が DB 応答をいつまでも待つことになる。タイムアウトも「読めなかった」と
// 同じ扱いにし、必ず有限時間で古い値へフォールバックする。
const LIVE_RECHECK_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`sheets-cache: live re-check timed out after ${ms}ms`)), ms);
    }),
  ]);
}

/**
 * unstable_cache の値が古そうに見えるとき（isDbContentStale）だけ、実際に DB へ 1 回
 * 直接問い合わせて「いま読めるか」を確認する。成功すれば新鮮な値として fetchedAt=now を
 * 返す（低頻度アクセスによる誤検知はここで消える）。失敗すれば古い値をそのまま返す —
 * この場合 isDbContentStale は次の呼び出し元判定でも再び true になり、「直接問い合わせて
 * 実際に失敗した」という本物の signal として stale 表示につながる。
 *
 * SkillSheetNotFoundError（シート自体が削除された等、DB 到達性とは無関係の既知のエラー）
 * はここで握り潰さず re-throw する。握り潰すと、削除済みシートを「古いキャッシュ」として
 * stale バナー付きで復活表示してしまう。
 *
 * unstable_cache 越しだと「本当に古いキャッシュを踏んだか」を外から再現しづらいため、
 * このメカニズム自体はテストのために export している（sheets-cache.test.ts 参照）。
 */
export async function withDbHealthCheck<C extends { fetchedAt: number }>(
  cached: C,
  liveFetch: () => Promise<Omit<C, 'fetchedAt'>>,
): Promise<C> {
  if (!isDbContentStale(cached.fetchedAt)) return cached;
  try {
    const fresh = await withTimeout(liveFetch(), LIVE_RECHECK_TIMEOUT_MS);
    return { ...fresh, fetchedAt: Date.now() } as C;
  } catch (err) {
    if (err instanceof SkillSheetNotFoundError) throw err;
    console.error('sheets-cache: live re-check failed; serving cached (aged) value with stale=true', err);
    return cached;
  }
}

// fetchedAt は unstable_cache の再検証時刻を判定するための内部実装詳細であり、公開 API
// （viewerProcedure 経由の sheet.byId 等）のレスポンスに生のタイムスタンプとして含める
// 意図はない（レビュー指摘）。tRPC ルータ側でこのヘルパーを通し、判定結果（stale）だけを
// 返してタイムスタンプ自体は落とす。
export function toStaleSheet<T extends { fetchedAt: number }>(sheet: T): Omit<T, 'fetchedAt'> & { stale: boolean } {
  const { fetchedAt, ...rest } = sheet;
  return { ...rest, stale: isDbContentStale(fetchedAt) };
}

// getCachedDbSheets と対になる、一覧向けの toStaleSheet。/view のシート一覧は
// getCachedDbSheetById/getCachedDbSheet と同じ unstable_cache の stale-while-revalidate
// 経路を通るにもかかわらず、DB 到達不能時に古い一覧を無期限に返し続けても画面上は
// 気付けなかった（chatgpt-codex-connector レビュー指摘: #204 修正が /view/db・
// /view/db/[id] のみを対象にしており、一覧の主導線 /view には及んでいなかった）。
export function toStaleSheetList<T>(list: { sheets: T; fetchedAt: number }): { sheets: T; stale: boolean } {
  return { sheets: list.sheets, stale: isDbContentStale(list.fetchedAt) };
}

// GitHub legacy 経路（/view/[path] 等）。標準導線からは外れているが将来削除まで温存。
export const getCachedSheets = unstable_cache(() => githubListSheets(), ['sheets-list'], {
  tags: ['sheets'],
  revalidate: 3600,
});

export const getCachedSheet = unstable_cache((path: string) => fetchSheetFile(path), ['sheet'], {
  tags: ['sheets'],
  revalidate: 3600,
});

// --- DB 正本経路 ---

// Neon DB のシート一覧（標準導線 /view が使う）。ビルダー保存後は 'db-sheet' タグで無効化。
// fetchedAt を同梱する（Issue #204 の一覧版。chatgpt-codex-connector レビュー指摘）。
const getCachedDbSheetsRaw = unstable_cache(
  async () => ({ sheets: await dbListSheets(), fetchedAt: Date.now() }),
  ['db-sheets-list'],
  { tags: ['db-sheet'], revalidate: DB_REVALIDATE_SECONDS },
);

/** getCachedDbSheetsRaw の結果を、古そうなときだけ直接問い合わせで健全性確認してから返す。 */
export async function getCachedDbSheets(): ReturnType<typeof getCachedDbSheetsRaw> {
  return withDbHealthCheck(await getCachedDbSheetsRaw(), async () => ({ sheets: await dbListSheets() }));
}

// 指定 ID のシートを読む（/view/db/[id] が使う）。fetchedAt を同梱する（Issue #204）。
const getCachedDbSheetByIdRaw = unstable_cache(
  async (id: string) => ({ ...(await getSkillSheetById(id)), fetchedAt: Date.now() }),
  ['db-sheet-by-id'],
  { tags: ['db-sheet'], revalidate: DB_REVALIDATE_SECONDS },
);

/** getCachedDbSheetByIdRaw の結果を、古そうなときだけ直接問い合わせで健全性確認してから返す。 */
export async function getCachedDbSheetById(id: string): ReturnType<typeof getCachedDbSheetByIdRaw> {
  return withDbHealthCheck(await getCachedDbSheetByIdRaw(id), () => getSkillSheetById(id));
}

// デフォルトシート（後方互換 /view/db 単体表示）。fetchedAt を同梱する（Issue #204）。
const getCachedDbSheetRaw = unstable_cache(
  async () => ({ ...(await getSkillSheet()), fetchedAt: Date.now() }),
  ['db-sheet'],
  { tags: ['db-sheet'], revalidate: DB_REVALIDATE_SECONDS },
);

/** getCachedDbSheetRaw の結果を、古そうなときだけ直接問い合わせで健全性確認してから返す。 */
export async function getCachedDbSheet(): ReturnType<typeof getCachedDbSheetRaw> {
  return withDbHealthCheck(await getCachedDbSheetRaw(), () => getSkillSheet());
}
