import type { ProjectBlockData } from '@skillsheet/db/blocks';

/**
 * 閲覧側で実際に見える案件だけに振る通し番号。
 *
 * 非表示の案件・非表示の会社配下の案件は欠番にせず詰める（閲覧側の表示と一致させるため）。
 * ナビ・レール・エディタ本体の3箇所が同じ番号を出す必要があるので、規則をここ1箇所に置く。
 * それぞれで書くと、片方だけ直したときに表示が食い違う。
 */
export const buildVisibleNoMap = (data: ProjectBlockData): Map<string, number> => {
  const hiddenCompany = new Set(data.companies.filter((c) => c.hidden).map((c) => c.id));
  const map = new Map<string, number>();
  let n = 0;
  for (const p of data.items) {
    if (!p.hidden && !hiddenCompany.has(p.companyId)) map.set(p.id, ++n);
  }
  return map;
};

/**
 * 非表示の案件について「もし表示されていたら何番になるか」を返す。
 * プレビューでカードの見た目を保ちつつ、非表示であることはバッジで別に伝えるために使う。
 */
export const previewNoOf = (data: ProjectBlockData, projectId: string | null): number => {
  if (!projectId) return 0;
  const hiddenCompany = new Set(data.companies.filter((c) => c.hidden).map((c) => c.id));
  let n = 0;
  for (const p of data.items) {
    if (p.id === projectId) return n + 1;
    if (!p.hidden && !hiddenCompany.has(p.companyId)) n++;
  }
  return 0;
};
