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
// ときにも「いつ時点の内容か」を応答から判定できる。revalidate 間隔を大きく超えて
// 古い場合は、直近の再検証が失敗している可能性が高いとみなして画面側に注意書きを出す。
const DB_STALE_THRESHOLD_MS = DB_REVALIDATE_SECONDS * 3 * 1000;

/** fetchedAt が DB_STALE_THRESHOLD_MS より古ければ、再検証に失敗している可能性が高いと判定する。 */
export function isDbContentStale(fetchedAt: number): boolean {
  return Date.now() - fetchedAt > DB_STALE_THRESHOLD_MS;
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
export const getCachedDbSheets = unstable_cache(() => dbListSheets(), ['db-sheets-list'], {
  tags: ['db-sheet'],
  revalidate: 60,
});

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
