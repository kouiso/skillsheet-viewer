import type { Block, ProjectTech } from '@skillsheet/db/blocks';
import { describe, expect, it } from 'vitest';

import {
  buildPrintViewModel,
  buildTechGroups,
  compactPeriod,
  companyLabelOf,
  firstSentence,
  formatProcessForPrint,
} from './print-view-model';

const emptyTech: ProjectTech = { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] };

describe('companyLabelOf', () => {
  it('会社名が区分を含んでいるときは足さない', () => {
    // 実データの会社名は「Q 社（自社サービス事業会社）」のように区分を含む。
    expect(companyLabelOf('Q 社（自社サービス事業会社）', '自社サービス事業会社')).toBe('Q 社（自社サービス事業会社）');
    expect(companyLabelOf('受託', '受託')).toBe('受託');
  });

  it('含んでいなければ括弧で添える', () => {
    expect(companyLabelOf('C 社', '業務委託')).toBe('C 社（業務委託）');
  });

  it('どちらかが空でも壊れない', () => {
    expect(companyLabelOf('', '業務委託')).toBe('業務委託');
    expect(companyLabelOf('C 社', '')).toBe('C 社');
  });
});

describe('compactPeriod', () => {
  it('同一年は終了側の年を省く', () => {
    expect(compactPeriod('2019.05 — 2019.07')).toBe('2019.05–07');
  });

  it('年をまたぐときは終了側の年を下 2 桁にする', () => {
    expect(compactPeriod('2018.11 — 2019.01')).toBe('2018.11–19.01');
  });

  it('終了が無ければ開始だけ返す', () => {
    expect(compactPeriod('2020.06')).toBe('2020.06');
  });

  it('解釈できない period はそのまま返す（データを壊さない）', () => {
    expect(compactPeriod('いつか')).toBe('いつか');
  });
});

describe('formatProcessForPrint', () => {
  it('7 段そろっていれば「全工程」に畳む', () => {
    const all = ['要件定義', '基本設計', '詳細設計', '実装・単体', '結合テスト', '総合テスト', '保守・運用'];
    expect(formatProcessForPrint(all)).toBe('要件定義 〜 保守・運用（全工程）');
  });

  it('3 段以上が連続していれば範囲表記にする', () => {
    expect(formatProcessForPrint(['要件定義', '基本設計', '詳細設計'])).toBe('要件定義 〜 詳細設計');
  });

  it('飛びがあるときは個別に並べる（実績を丸めない）', () => {
    expect(formatProcessForPrint(['要件定義', '実装・単体', '保守・運用'])).toBe('要件定義, 実装・単体, 保守・運用');
  });

  it('7 段モデルに載らない工程は落とさず後ろに付ける', () => {
    expect(formatProcessForPrint(['実装', 'スクラム開発'])).toBe('実装・単体, スクラム開発');
  });

  it('空なら空文字', () => {
    expect(formatProcessForPrint([])).toBe('');
  });
});

describe('buildTechGroups', () => {
  it('各分類の先頭 1 個だけを塗りチップにする', () => {
    const groups = buildTechGroups({ ...emptyTech, lang: ['TypeScript', 'Python'] });
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('言語');
    expect(groups[0].chips.map((c) => c.emphasis)).toEqual(['solid', 'outline']);
  });

  it('上限を超えた分は「他 N 件」に畳む', () => {
    const many = Array.from({ length: 9 }, (_, i) => `tool${i}`);
    const groups = buildTechGroups({ ...emptyTech, tools: many });
    expect(groups[0].chips).toHaveLength(6);
    expect(groups[0].overflowCount).toBe(3);
  });

  it('中身が無い分類は行ごと出さない', () => {
    expect(buildTechGroups({ ...emptyTech, lang: ['-', ' '] })).toEqual([]);
  });
});

describe('firstSentence', () => {
  it('箇条書き記号を落として先頭 1 文を返す', () => {
    expect(firstSentence('- iOS アプリの機能開発。\n- バックエンドの実装。')).toBe('iOS アプリの機能開発。');
  });

  it('強調記法を落とす', () => {
    expect(firstSentence('**Next.js** で実装。')).toBe('Next.js で実装。');
  });

  it('長すぎる文は末尾を切る', () => {
    const long = `${'あ'.repeat(80)}。`;
    const result = firstSentence(long);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(61);
  });

  it('空なら空文字', () => {
    expect(firstSentence('   ')).toBe('');
  });
});

// --- buildPrintViewModel ---------------------------------------------------

function blocksFixture(): Block[] {
  return [
    {
      id: 'b1',
      type: 'profile',
      order: 0,
      data: {
        name: 'I・K',
        title: '',
        pr: '自己紹介の本文。',
        strengths: [],
        meta: { age: '28 歳' },
        company: '株式会社 X',
      },
    },
    {
      id: 'b2',
      type: 'skills',
      order: 1,
      data: {
        category: '言語',
        skills: [
          { name: 'TypeScript', years: 8, level: '上級' },
          { name: 'Python', years: 4, level: '中級' },
        ],
      },
    },
    { id: 'b3', type: 'stats', order: 2, data: { items: [{ value: '8', unit: '年', label: 'エンジニア歴' }] } },
    {
      id: 'b4',
      type: 'project',
      order: 3,
      data: {
        companies: [
          { id: 'c1', name: '新しい会社', kind: '業務委託', period: '2026 年 1 月〜2026 年 9 月', note: '概要文。' },
          { id: 'c2', name: '古い会社', kind: '受託', period: '2017 年 8 月〜2018 年 1 月', note: '' },
          { id: 'c3', name: '隠した会社', kind: '受託', period: '', note: '', hidden: true },
        ],
        items: [
          {
            id: 'p1',
            companyId: 'c1',
            title: '新しい案件',
            scope: '',
            period: '2026.01 — 2026.09',
            role: 'PL',
            team: '5 名',
            tech: { ...emptyTech, lang: ['TypeScript'] },
            process: ['要件定義', '実装'],
            duties: '- 実装を担当。',
            acquired: '設計の勘所。',
            comment: '所感。',
          },
          {
            id: 'p2',
            companyId: 'c2',
            title: '古い案件',
            scope: '',
            period: '2017.08 — 2018.01',
            role: '',
            team: '1 名',
            tech: emptyTech,
            process: [],
            duties: '',
            acquired: '',
            comment: '',
          },
          {
            id: 'p3',
            companyId: 'c3',
            title: '隠した案件',
            scope: '',
            period: '2020.01 — 2020.02',
            role: '',
            team: '',
            tech: emptyTech,
            process: [],
            duties: '',
            acquired: '',
            comment: '',
          },
        ],
      },
    },
  ];
}

describe('buildPrintViewModel', () => {
  it('hidden な会社と配下案件を落とす', () => {
    const vm = buildPrintViewModel('シート', blocksFixture());
    expect(vm.companies.map((c) => c.name)).toEqual(['新しい会社', '古い会社']);
    expect(vm.companies.flatMap((c) => c.projects).map((p) => p.title)).toEqual(['新しい案件', '古い案件']);
  });

  it('先頭の会社だけを直近扱いにする', () => {
    const vm = buildPrintViewModel('シート', blocksFixture());
    expect(vm.companies.map((c) => c.isLatest)).toEqual([true, false]);
  });

  it('直近の案件は詳細版、古い案件は簡約版になる', () => {
    const vm = buildPrintViewModel('シート', blocksFixture());
    const levels = new Map(vm.companies.flatMap((c) => c.projects).map((p) => [p.title, p.level]));
    expect(levels.get('新しい案件')).toBe('detail');
    expect(levels.get('古い案件')).toBe('compact');
  });

  it('値が空のメタ行は作らない', () => {
    const vm = buildPrintViewModel('シート', blocksFixture());
    const old = vm.companies[1].projects[0];
    // 役割も担当工程も空なので、チームと技術領域だけが残る
    expect(old.metaRows.map((r) => r.label)).toEqual(['チーム']);
  });

  it('肩書きが空なら空文字のまま渡す（描画側でスロットごと出さない）', () => {
    expect(buildPrintViewModel('シート', blocksFixture()).summary.title).toBe('');
  });

  it('主力スタックは経験年数の降順で、上級だけ塗りにする', () => {
    const vm = buildPrintViewModel('シート', blocksFixture());
    expect(vm.summary.topSkills).toEqual([
      { label: 'TypeScript 8 年', emphasis: 'solid' },
      { label: 'Python 4 年', emphasis: 'outline' },
    ]);
  });

  it('中身が空の統計項目は落とす（1 ページ目に空セルを作らない）', () => {
    const blocks = blocksFixture();
    const stats = blocks.find((b) => b.type === 'stats');
    if (stats?.type === 'stats') stats.data.items.push({ value: ' ', unit: '', label: '  ' });
    expect(buildPrintViewModel('シート', blocks).summary.stats).toHaveLength(1);
  });

  it('対応可能工程は全案件の和集合', () => {
    expect(buildPrintViewModel('シート', blocksFixture()).summary.processLabels).toEqual(['要件定義', '実装・単体']);
  });

  it('会社の在籍期間が空なら配下案件から導出する', () => {
    const blocks = blocksFixture();
    const project = blocks.find((b) => b.type === 'project');
    if (project?.type === 'project') project.data.companies[1].period = '';
    const vm = buildPrintViewModel('シート', blocks);
    expect(vm.companies[1].periodText).toBe('2017.08〜2018.01');
  });

  it('ビュートグルがそのまま出し分けのフラグになる', () => {
    const vm = buildPrintViewModel('シート', blocksFixture(), ['projects']);
    expect(vm.showProjects).toBe(true);
    expect(vm.showSkills).toBe(false);
    expect(vm.showProcess).toBe(false);
  });

  it('トグル未指定なら全部 ON', () => {
    const vm = buildPrintViewModel('シート', blocksFixture());
    expect([vm.showProjects, vm.showSkills, vm.showProcess]).toEqual([true, true, true]);
  });
});
