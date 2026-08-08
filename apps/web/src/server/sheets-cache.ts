import { listSheets as dbListSheets, getSkillSheet, getSkillSheetById } from '@skillsheet/db';
import { unstable_cache } from 'next/cache';

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
// ときにも「いつ時点の内容か」を応答から判定できる。
//
// 注意: revalidate 間隔を超えて古いことは「直近の再検証が失敗した」ことの証明にはならない
// （Codex レビュー指摘）。unstable_cache の stale-while-revalidate は、revalidate 秒数を
// 過ぎてもアクセスが無ければバックグラウンド再検証そのものが走らず、fetchedAt は前回
// 成功時のまま古くなり続ける。つまりアクセス頻度の低い健全なシートでも、単に「しばらく
// 見られていなかった」だけで DB_STALE_THRESHOLD_MS を超えうる。この関数からは
// 「失敗している」と「アクセスが無く更新機会がなかった」を区別できないため、
// isDbContentStale() の呼び出し側では「再検証に失敗している可能性」ではなく
// 「表示内容が最新でない可能性がある（原因は問わない）」という、両ケースで真になる
// 弱い主張だけを画面に出すこと（sheet-view-client.tsx のバナー文言を参照）。
const DB_STALE_THRESHOLD_MS = DB_REVALIDATE_SECONDS * 3 * 1000;

/** fetchedAt が DB_STALE_THRESHOLD_MS より古ければ、表示内容が最新でない可能性がある。 */
export function isDbContentStale(fetchedAt: number): boolean {
  return Date.now() - fetchedAt > DB_STALE_THRESHOLD_MS;
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
export const getCachedDbSheets = unstable_cache(
  async () => ({ sheets: await dbListSheets(), fetchedAt: Date.now() }),
  ['db-sheets-list'],
  { tags: ['db-sheet'], revalidate: 60 },
);

// 指定 ID のシートを読む（/view/db/[id] が使う）。fetchedAt を同梱する（Issue #204）。
export const getCachedDbSheetById = unstable_cache(
  async (id: string) => ({ ...(await getSkillSheetById(id)), fetchedAt: Date.now() }),
  ['db-sheet-by-id'],
  { tags: ['db-sheet'], revalidate: DB_REVALIDATE_SECONDS },
);

// デフォルトシート（後方互換 /view/db 単体表示）。fetchedAt を同梱する（Issue #204）。
export const getCachedDbSheet = unstable_cache(
  async () => ({ ...(await getSkillSheet()), fetchedAt: Date.now() }),
  ['db-sheet'],
  { tags: ['db-sheet'], revalidate: DB_REVALIDATE_SECONDS },
);
