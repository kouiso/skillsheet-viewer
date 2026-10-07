import { describe, expect, it } from 'vitest';
import type { ProjectItem } from '@/db/block';
import { projectBlockingWarnings, projectWarnings } from './project-warning';

const base: ProjectItem = {
  id: 'p',
  companyId: 'c',
  title: '合成案件',
  period: '2024.01 — 2024.12',
  scope: '',
  role: '',
  team: '',
  tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] },
  process: [],
  duties: '',
  acquired: '',
  comment: '',
};
function block(item: ProjectItem) {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    type: 'project',
    order: 0,
    data: { companies: [{ id: 'c', name: '合成会社', kind: '', period: '', note: '' }], items: [item] },
  };
}
describe('保存正本に基づく入力状態', () => {
  it.each([
    ['案件名未入力', { ...base, title: '' }, 1, 0],
    [
      '原文と一致する逆転期間',
      { ...base, period: '2024.12 — 2024.01', periodStart: '2024-12', periodEnd: '2024-01', ongoing: false },
      1,
      0,
    ],
    ['期間の内部値3項目不一致', { ...base, periodStart: '2025-01', periodEnd: '2025-12', ongoing: true }, 1, 1],
    ['投影を持たない旧形式', { ...base, period: '数年前頃' }, 0, 0],
    ['旧形式と明示投影の不一致', { ...base, period: '数年前頃', periodStart: '2024-01' }, 1, 1],
  ] as const)('%sを注意/保存不可として区別する', (_name, item, warnings, blocked) => {
    expect(projectWarnings(item)).toHaveLength(warnings);
    expect(projectBlockingWarnings([block(item)])).toHaveLength(blocked);
  });
  it('終了月のみの不一致は終了月へ案内する', () => {
    expect(projectBlockingWarnings([block({ ...base, periodEnd: '2024-11' })])).toEqual([
      {
        blockId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        projectId: 'p',
        field: 'period',
        target: 'input[aria-label="終了月"]',
      },
    ]);
  });
});
