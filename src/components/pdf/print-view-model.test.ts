import { describe, expect, it } from 'vitest';
import type { Block, ProjectTech } from '@/db/blocks';

import {
  buildPrintViewModel,
  buildTechGroups,
  compactPeriod,
  companyLabelOf,
  dedupeRoles,
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

  it('件数の上限を持たない（元データを全件表示する — 他 N 件で畳まない）', () => {
    const many = Array.from({ length: 9 }, (_, i) => `tool${i}`);
    const groups = buildTechGroups({ ...emptyTech, tools: many });
    expect(groups[0].chips).toHaveLength(9);
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

  it('スキルのビュートグルを OFF にすると 1 ページ目の主力スタックも空にする', () => {
    // 実測で出た欠陥: 以前は topSkills が showSkills を一切見ずに組み立てられており、
    // スキル一覧「ページ」は OFF で消えても 1 ページ目の「主力スタック（経験年数）」
    // 見出し＋チップだけが残った（トグルの約束「押した瞬間の状態がそのまま PDF に効く」
    // の破り。skillYearsLabel が年数だけ空にするので、見出しが「経験年数」と言っているのに
    // 年数がどこにも無い壊れ方だった）。
    //
    // 赤くなることを確認済み: buildSummary の `const flatSkills = showSkills ? ... : []` を
    // `showSkills` を見ずに常に組み立てる形へ戻すと、この it は落ちる
    // （summary.topSkills が空配列でなく TypeScript/Python のチップを含む）。
    const vm = buildPrintViewModel('シート', blocksFixture(), ['projects', 'process']);
    expect(vm.summary.topSkills).toEqual([]);
  });

  it('要約だけ入力し担当業務を空にした案件は、要約の全文を duties として持つ', () => {
    // ビューア（project-card.tsx:55 `item.summary?.trim() || item.duties`）と同じ優先順位。
    // 以前は PrintProject.duties が item.duties しか見ておらず、要約だけ入力した直近案件
    // （詳細版カード）は「業務内容」ブロックが 1 つも出ない静かなデータ欠落だった。
    // 60 文字超・2 文の本文にする（firstSentence が使う compactNote 側の 1 文/60 文字切りを
    // 混同していないことも確かめる — ここで見るのは duties そのもので、切られていないこと）。
    const summaryText =
      '決済基盤のリプレイスを設計から主導した案件。旧バッチの段階移行と本番切り替えまで担当し、無停止で移行を完了させた。';
    const blocks = blocksFixture();
    const project = blocks.find((b) => b.type === 'project');
    if (project?.type === 'project') {
      project.data.items[0].duties = '';
      project.data.items[0].summary = summaryText;
    }
    // 赤くなることを確認済み: buildProject の
    // `const duties = trimmed(item.summary) || trimmed(item.duties);` を
    // `const duties = trimmed(item.duties);` に戻すと、この it は空文字との比較で落ちる。
    const vm = buildPrintViewModel('シート', blocks);
    expect(vm.companies[0].projects[0].duties).toBe(summaryText);
  });
});

describe('dedupeRoles', () => {
  // 実測で出た欠陥をそのまま固定する。案件カードに「役割：PL, PL」、
  // 会社行に「フルスタックエンジニア、フルスタックエンジニア / エンジニアリングマネージャー」
  // と同じ役割が 2 度並んでいた。
  //
  // 赤くなることを確認済み: dedupeRoles の `new Set(...)` を外す（分割と結合はそのまま）と、
  // この describe の 5 件中 4 件が落ちる。緑のまま通るテストは何も守っていないので、
  // 手を入れるときは同じ壊し方でもう一度赤を見ること。
  it('1 つの役割文字列の中の重複を消す', () => {
    expect(dedupeRoles('PL, PL')).toBe('PL');
  });

  it('複数案件にまたがる重複を、部分一致ではなく役割単位で消す', () => {
    expect(dedupeRoles('フルスタックエンジニア', 'フルスタックエンジニア / エンジニアリングマネージャー')).toBe(
      'フルスタックエンジニア、エンジニアリングマネージャー',
    );
  });

  it('区切りは読点。中黒は役割名の一部なので割らない', () => {
    expect(dedupeRoles('バックエンドリード・インフラエンジニア', 'PM')).toBe(
      'バックエンドリード・インフラエンジニア、PM',
    );
  });

  it('先に出た順を保つ', () => {
    expect(dedupeRoles('PM, PL', 'PL, SE')).toBe('PM、PL、SE');
  });

  it('空・未定義・空白だけの役割は落とす', () => {
    expect(dedupeRoles('', undefined, '  ', 'PL,,  ,PL')).toBe('PL');
  });
});


describe('レビュー指摘の回帰: 消える情報・潰れる情報', () => {
  it('得意分野（strengths）を PDF のサマリへ載せる', () => {
    const blocks = blocksFixture();
    const profile = blocks.find((b) => b.type === 'profile');
    if (profile?.type === 'profile') profile.data.strengths = ['バックエンド設計', 'チームリード'];
    const vm = buildPrintViewModel('シート', blocks);
    expect(vm.summary.strengths).toEqual(['バックエンド設計', 'チームリード']);
  });

  it('プレーンテキストの script は中身ごと落とす（他の表示経路では隠れている）', () => {
    const blocks = blocksFixture();
    const profile = blocks.find((b) => b.type === 'profile');
    if (profile?.type === 'profile') profile.data.name = '<script>confidential</script>磯貝';
    const vm = buildPrintViewModel('シート', blocks);
    expect(vm.summary.name).toBe('磯貝');
  });

  it('タイムラインだけ ON でも案件セクションを出す（PDF に時系列の専用面は無い）', () => {
    const vm = buildPrintViewModel('シート', blocksFixture(), ['timeline']);
    expect(vm.showProjects).toBe(true);
  });

  it('スキルを OFF にすると 1 ページ目の主力スタックも空になる', () => {
    const vm = buildPrintViewModel('シート', blocksFixture(), ['projects']);
    expect(vm.summary.topSkills).toEqual([]);
  });
});
