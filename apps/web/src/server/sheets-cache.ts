import { getSkillSheet } from '@skillsheet/db';
import { unstable_cache } from 'next/cache';

import { fetchSheetFile, listSheets } from '@/server/github-sheets';

// 公開閲覧の RSC が共有するキャッシュ層。編集/保存時は revalidateTag('sheets') で無効化する想定。
export const getCachedSheets = unstable_cache(() => listSheets(), ['sheets-list'], {
  tags: ['sheets'],
  revalidate: 3600,
});

export const getCachedSheet = unstable_cache((path: string) => fetchSheetFile(path), ['sheet'], {
  tags: ['sheets'],
  revalidate: 3600,
});

// Neon DB 正本からスキルシートを読み取るキャッシュ。ビルダー保存後は 'db-sheet' タグで無効化される。
export const getCachedDbSheet = unstable_cache(() => getSkillSheet(), ['db-sheet'], {
  tags: ['db-sheet'],
  revalidate: 60,
});
