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

// #204: unstable_cache は DB ダウン時も永続キャッシュ（.next/cache）から陳腐な 200 を
// 返し続ける。デモ規模では DB 直接読みで十分なため、クロスリクエストキャッシュを解除し、
// DB 障害を素早く検知・表示する。
export const getCachedDbSheets = () => dbListSheets();

export const getCachedDbSheetById = (id: string) => getSkillSheetById(id);

export const getCachedDbSheet = () => getSkillSheet();
