import { describe, expect, it } from 'vitest';

import type { ProjectItem, ProjectTech } from './blocks';
import {
  DETAIL_CUTOFF_MONTHS,
  detailBaseline,
  isLeadRole,
  periodMonths,
  resolveDetailLevels,
  SENIOR_MAX_COUNT,
} from './project-detail-level';

const emptyTech: ProjectTech = { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] };

function item(id: string, period: string, role = ''): ProjectItem {
  return {
    id,
    companyId: 'c1',
    title: id,
    scope: '',
    period,
    role,
    team: '',
    tech: emptyTech,
    process: [],
    duties: '',
    acquired: '',
    comment: '',
  };
}

describe('isLeadRole', () => {
  it.each([
    'PL',
    'PM & PL',
    'PM, PL',
    'PMO→PL',
    'PM',
    'バックエンドリード・インフラエンジニア',
  ])('率いていたと読める役割は true: %s', (role) => {
    expect(isLeadRole(role)).toBe(true);
  });

  it.each(['SE', 'SE サポート', '実装', ''])('担当者の役割は false: %s', (role) => {
    expect(isLeadRole(role)).toBe(false);
  });

  it('エンジニアリングマネージャーは true', () => {
    expect(isLeadRole('フルスタックエンジニア / エンジニアリングマネージャー')).toBe(true);
  });
});

describe('periodMonths', () => {
  it('両端を含む月数を返す', () => {
    expect(periodMonths('2025.11 — 2026.07')).toBe(9);
    expect(periodMonths('2024.01 — 2024.01')).toBe(1);
  });

  it('解釈できない period は null', () => {
    expect(periodMonths('')).toBeNull();
    expect(periodMonths('いつか')).toBeNull();
  });
});

describe('detailBaseline', () => {
  it('シート内の最も新しい終了月を返す（実行日に依存しない）', () => {
    const baseline = detailBaseline([item('a', '2020.01 — 2020.06'), item('b', '2026.01 — 2026.09')]);
    // 2026.09 = 2026 + 8/12
    expect(baseline).toBeCloseTo(2026 + 8 / 12, 6);
  });

  it('1 件も解釈できなければ null', () => {
    expect(detailBaseline([item('a', '')])).toBeNull();
  });
});

describe('resolveDetailLevels', () => {
  it('直近 24 ヶ月以内に稼働した案件は詳細版', () => {
    const items = [item('recent', '2026.01 — 2026.09'), item('twoYears', '2024.09 — 2024.10')];
    const { levelById } = resolveDetailLevels(items);
    expect(levelById.get('recent')).toBe('detail');
    // 基準 2026.09 から 23 ヶ月前なので、まだ直近の枠に入る
    expect(levelById.get('twoYears')).toBe('detail');
  });

  it('直近の枠から外れた担当者ロールの案件は簡約版', () => {
    const items = [item('recent', '2026.01 — 2026.09'), item('old', '2019.01 — 2019.06', 'SE')];
    expect(resolveDetailLevels(items).levelById.get('old')).toBe('compact');
  });

  it('古くても PL 以上かつ 6 ヶ月以上なら詳細版に上がる', () => {
    const items = [item('recent', '2026.01 — 2026.09'), item('oldLead', '2021.07 — 2023.03', 'PL')];
    expect(resolveDetailLevels(items).levelById.get('oldLead')).toBe('detail');
  });

  it('PL 以上でも 6 ヶ月未満なら上がらない', () => {
    const items = [item('recent', '2026.01 — 2026.09'), item('shortLead', '2019.01 — 2019.03', 'PL')];
    expect(resolveDetailLevels(items).levelById.get('shortLead')).toBe('compact');
  });

  it('規則 2 で上がるのは期間の長い順に SENIOR_MAX_COUNT 件まで', () => {
    const items = [
      item('recent', '2026.01 — 2026.09'),
      item('lead20m', '2018.01 — 2019.08', 'PL'),
      item('lead18m', '2018.01 — 2019.06', 'PL'),
      item('lead12m', '2018.01 — 2018.12', 'PL'),
      item('lead06m', '2018.01 — 2018.06', 'PL'),
    ];
    const { levelById } = resolveDetailLevels(items);
    const promoted = ['lead20m', 'lead18m', 'lead12m', 'lead06m'].filter((id) => levelById.get(id) === 'detail');
    expect(promoted).toEqual(['lead20m', 'lead18m', 'lead12m']);
    expect(promoted).toHaveLength(SENIOR_MAX_COUNT);
  });

  it('period が解釈できない案件は簡約版に落とす', () => {
    const items = [item('recent', '2026.01 — 2026.09'), item('unknown', '', 'PL')];
    expect(resolveDetailLevels(items).levelById.get('unknown')).toBe('compact');
  });

  it('detailCount は詳細版の件数と一致する', () => {
    const items = [item('a', '2026.01 — 2026.09'), item('b', '2026.02 — 2026.08'), item('c', '2015.01 — 2015.06')];
    const { detailCount, levelById } = resolveDetailLevels(items);
    expect(detailCount).toBe([...levelById.values()].filter((v) => v === 'detail').length);
    expect(detailCount).toBe(2);
  });

  it('閾値は定数から読む（実装側で変えてもテストが追従する）', () => {
    const items = [item('recent', '2026.01 — 2026.09')];
    const baseline = detailBaseline(items);
    expect(baseline).not.toBeNull();
    expect(DETAIL_CUTOFF_MONTHS).toBeGreaterThan(0);
  });
});

describe('isLeadRole: ラテン略号は語として独立しているときだけ拾う', () => {
  it('単語の一部に PL / EM を含むだけの役割はリードとみなさない', () => {
    expect(isLeadRole('Implementation Engineer')).toBe(false);
    expect(isLeadRole('System Engineer')).toBe(false);
  });

  it('区切り文字で独立している略号は従来どおり拾う', () => {
    expect(isLeadRole('PL')).toBe(true);
    expect(isLeadRole('PM & PL')).toBe(true);
    expect(isLeadRole('PMO→PL')).toBe(true);
    expect(isLeadRole('EM / フルスタックエンジニア')).toBe(true);
  });

  it('日本語の語は従来どおり部分一致で拾う', () => {
    expect(isLeadRole('バックエンドリード・インフラエンジニア')).toBe(true);
    expect(isLeadRole('エンジニアリングマネージャー')).toBe(true);
  });
});
