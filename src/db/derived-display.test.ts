import { describe, expect, it } from 'vitest';
import type { ProjectItem, ProjectTech } from './blocks';
import {
  deriveSkillExperienceMonths,
  normalizeTechnologyCandidates,
  resolveCompanyPeriod,
  resolveDisplayedSkillExperience,
  resolveDisplayedStats,
  technologyNamesMatch,
} from './derived-display';

const EMPTY_TECH: ProjectTech = { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] };

function project(id: string, period: string, tech: Partial<ProjectTech> = {}): ProjectItem {
  return {
    id,
    companyId: 'c1',
    title: id,
    scope: '',
    period,
    role: '',
    team: '',
    tech: { ...EMPTY_TECH, ...tech },
    process: [],
    duties: '',
    acquired: '',
    comment: '',
  };
}

describe('resolveDisplayedStats', () => {
  it('案件が入っている月だけを重複なしで数え、指定ラベルだけを差し替える', () => {
    const projects = [project('p1', '2020.01 — 2020.12'), project('p2', '2020.06 — 2021.12'), project('p3', '2023')];
    expect(
      resolveDisplayedStats(
        [
          { value: '8', unit: '年', label: 'エンジニア歴' },
          { value: '30+', unit: '案件', label: '参画プロジェクト数' },
          { value: '4', unit: '名', label: 'なんとか歴' },
        ],
        projects,
      ),
    ).toEqual([
      { value: '2', unit: '年', label: 'エンジニア歴' },
      { value: '3', unit: '案件', label: '参画プロジェクト数' },
      { value: '4', unit: '名', label: 'なんとか歴' },
    ]);
  });

  it('月を1件も読めない場合、経験年数は手入力へ戻す', () => {
    const stats = [{ value: '8', unit: '年', label: '経験年数' }];
    expect(resolveDisplayedStats(stats, [project('p1', '不明'), project('p2', '2020')])).toEqual(stats);
  });

  it('案件ブロックが無ければ手入力値を維持する', () => {
    const stats = [{ value: '12', unit: '件', label: '案件数' }];
    expect(resolveDisplayedStats(stats, undefined)).toEqual(stats);
  });

  it('経験値は表示単位に合わせて年または月へ変換する', () => {
    const projects = [project('p1', '2020.01 — 2021.12')];
    expect(
      resolveDisplayedStats(
        [
          { value: '1', unit: '年', label: '実務経験' },
          { value: '1', unit: 'ヶ月', label: '経験年数' },
          { value: '手入力', unit: '日', label: 'エンジニア歴' },
        ],
        projects,
      ),
    ).toEqual([
      { value: '2', unit: '年', label: '実務経験' },
      { value: '24', unit: 'ヶ月', label: '経験年数' },
      { value: '手入力', unit: '日', label: 'エンジニア歴' },
    ]);
  });
});

describe('resolveCompanyPeriod', () => {
  it('手入力を優先し、空なら案件期間から導出する', () => {
    const items = [project('p1', '2018.02 — 2019.03'), project('p2', '2020.01 — 2021.02')];
    expect(
      resolveCompanyPeriod({ id: 'c1', name: '会社', kind: '', period: '2022.01 — 2022.12', note: '' }, items),
    ).toBe('2022.01 — 2022.12');
    expect(resolveCompanyPeriod({ id: 'c1', name: '会社', kind: '', period: '', note: '' }, items)).toBe(
      '2018.02 — 2021.02',
    );
  });
});

describe('技術名の完全一致', () => {
  it('複合名、括弧内別名、末尾バージョンを候補化する', () => {
    expect(normalizeTechnologyCandidates('TypeScript/JavaScript')).toEqual(
      new Set(['typescript/javascript', 'typescript', 'javascript']),
    );
    expect(technologyNamesMatch('Python', 'Python 3.13')).toBe(true);
    expect(technologyNamesMatch('CI/CD (GitHub Actions)', 'GitHub Actions')).toBe(true);
  });

  it('JavaとJavaScript、ReactとReact Nativeを誤って一致させない', () => {
    expect(technologyNamesMatch('Java', 'JavaScript')).toBe(false);
    expect(technologyNamesMatch('React', 'React Native')).toBe(false);
    expect(technologyNamesMatch('C', 'C++')).toBe(false);
    expect(technologyNamesMatch('C++', 'C++')).toBe(true);
  });

  it('一致案件の月を重複なく集計する', () => {
    const items = [
      project('p1', '2020.01 — 2020.12', { lang: ['TypeScript'] }),
      project('p2', '2020.07 — 2021.06', { lang: ['JavaScript'] }),
      project('p3', '2020.01 — 2025.12', { fw: ['React Native'] }),
    ];
    expect(deriveSkillExperienceMonths('TypeScript/JavaScript', items)).toBe(18);
    expect(deriveSkillExperienceMonths('React', items)).toBe(0);
  });

  it('該当案件が無ければ手入力へ戻す', () => {
    expect(
      resolveDisplayedSkillExperience({ name: 'Kubernetes', years: 1 }, [project('p1', '2020.01 — 2020.12')]),
    ).toEqual({
      months: 12,
      label: '1年',
      derived: false,
    });
  });

  it('現在までの案件はサーバーから渡した固定月まで数える', () => {
    expect(
      deriveSkillExperienceMonths(
        'React Native',
        [project('p1', '2019.10 — 現在', { fw: ['React Native'] })],
        2026 * 12 + 8,
      ),
    ).toBe(84);
  });

  it('固定月が無い継続中案件は手入力へ戻す', () => {
    expect(
      resolveDisplayedSkillExperience({ name: 'React Native', years: 1 }, [
        project('p1', '2019.10 — 現在', { fw: ['React Native'] }),
      ]),
    ).toEqual({ months: 12, label: '1年', derived: false });
  });
});
