import { listSheets as dbListSheets, getSkillSheet, getSkillSheetById } from '@skillsheet/db';
import { unstable_cache } from 'next/cache';

import { fetchSheetFile, listSheets as githubListSheets } from '@/server/github-sheets';

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

// 指定 ID のシートを読む（/view/db/[id] が使う）。
export const getCachedDbSheetById = unstable_cache((id: string) => getSkillSheetById(id), ['db-sheet-by-id'], {
  tags: ['db-sheet'],
  revalidate: 60,
});

// デフォルトシート（後方互換 /view/db 単体表示）。
export const getCachedDbSheet = unstable_cache(() => getSkillSheet(), ['db-sheet'], {
  tags: ['db-sheet'],
  revalidate: 60,
});
