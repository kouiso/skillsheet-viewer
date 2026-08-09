import { describe, expect, it } from 'vitest';

import { isTableSeparatorRow, parseCareerMarkdown } from './migrate-real-sheet';

/**
 * 案件1件分の最小 markdown。`extra` に渡した行を `#### プロジェクト概要` の直前
 * （＝案件見出しの直後）へ差し込む。案件21の前置き一文と同じ位置。
 */
function careerMarkdown(extra = '', subsections = ''): string {
  return [
    '## 経歴',
    '',
    '### 株式会社サンプル - 2020年4月 - 現在',
    '',
    '#### ■ 1. PatentStart',
    extra,
    '#### プロジェクト概要',
    '',
    '| 項目 | 内容 |',
    '|---|---|',
    '| 期間 | 2021年1月 - 2021年12月 |',
    '| 役割 | **バックエンド** |',
    '',
    '#### 技術スタック',
    '',
    '| 項目 | 内容 |',
    '|---|---|',
    '| 言語 | TypeScript, Go |',
    '',
    '#### コメント',
    '',
    '≪担当業務≫',
    'API の設計と実装。',
    '',
    '≪コメント≫',
    'チームで進めた。',
    subsections,
  ].join('\n');
}

describe('parseCareerMarkdown', () => {
  it('案件見出しと最初のサブセクションの間に置かれた前置き文を捨てずに検出する（#151 D-7）', () => {
    const preface = 'App Store から、PatentStart と検索すると、赤いアプリが表示されます。';
    const { items, dropped } = parseCareerMarkdown(careerMarkdown(preface));

    expect(items).toHaveLength(1);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].line).toBe(preface);
    expect(dropped[0].where).toContain('PatentStart');
    expect(dropped[0].where).toContain('冒頭');
  });

  it('前置き文が無い正常な元データでは1行も捨てない（誤検知しない）', () => {
    const { items, dropped } = parseCareerMarkdown(careerMarkdown());

    expect(items).toHaveLength(1);
    expect(dropped).toEqual([]);
  });

  it('≪担当業務≫ の前に置かれた前置き文はコメントへ取り込まれ、捨てた行にはならない', () => {
    // parseCommentSection 側で拾われる位置（#### コメント の中）は取り込み済みなので警告しない。
    const md = careerMarkdown().replace('≪担当業務≫', '導入文です。\n\n≪担当業務≫');
    const { items, dropped } = parseCareerMarkdown(md);

    expect(items[0].comment).toContain('導入文です。');
    expect(dropped).toEqual([]);
  });

  it('誰も読まない未知のサブセクションの中身を検出する', () => {
    const { dropped } = parseCareerMarkdown(careerMarkdown('', ['', '#### 備考', '', '社外秘の補足。'].join('\n')));

    expect(dropped).toHaveLength(1);
    expect(dropped[0].line).toBe('社外秘の補足。');
    expect(dropped[0].where).toContain('備考');
  });

  it('プロジェクト概要の中で表の行として解釈できない自由文を検出する', () => {
    const md = careerMarkdown().replace('| 期間 | 2021年1月 - 2021年12月 |', '補足: 途中で体制が変わりました。');
    const { dropped } = parseCareerMarkdown(md);

    expect(dropped.map((d) => d.line)).toContain('補足: 途中で体制が変わりました。');
    expect(dropped[0].where).toContain('プロジェクト概要');
  });

  it('最初の会社見出しより前に置かれた行を検出する', () => {
    const md = [
      '## 経歴',
      '',
      'ここに書いた文はどこにも入りません。',
      '',
      ...careerMarkdown().split('\n').slice(2),
    ].join('\n');
    const { dropped } = parseCareerMarkdown(md);

    expect(dropped.map((d) => d.line)).toContain('ここに書いた文はどこにも入りません。');
  });

  it('会社見出しより前に置かれた案件は丸ごと捨てられるので検出する', () => {
    const md = [
      '## 経歴',
      '',
      '#### ■ 1. 迷子の案件',
      '',
      '本文が入っています。',
      '',
      ...careerMarkdown().split('\n').slice(2),
    ].join('\n');
    const { items, dropped } = parseCareerMarkdown(md);

    // 会社に紐づく案件だけが取り込まれる。
    expect(items).toHaveLength(1);
    expect(dropped.map((d) => d.line)).toContain('■ 1. 迷子の案件');
    expect(dropped.map((d) => d.line)).toContain('本文が入っています。');
  });

  it('空行と表の区切り行は捨てた行として報告しない', () => {
    const { dropped } = parseCareerMarkdown(careerMarkdown());

    expect(dropped).toEqual([]);
    expect(isTableSeparatorRow('|---|---|')).toBe(true);
    expect(isTableSeparatorRow('| :--- | ---: |')).toBe(true);
    expect(isTableSeparatorRow('| 期間 | 2021年 |')).toBe(false);
    expect(isTableSeparatorRow('ふつうの文')).toBe(false);
  });
});
