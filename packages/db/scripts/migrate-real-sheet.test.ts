import { describe, expect, it } from 'vitest';

import {
  type DroppedLine,
  isTableSeparatorRow,
  parseCareerMarkdown,
  parseProfileMarkdown,
  parseSkillsMarkdown,
} from './migrate-real-sheet';

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
    '#### ■ 1. 士業向けマッチングアプリ',
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
    '#### 担当工程',
    '',
    '| 工程 | 要件定義 | 基本設計 | 詳細設計 | 実装・単体 | 結合テスト | 総合テスト | 保守・運用 |',
    '|---|---|---|---|---|---|---|---|',
    '| 経験 | ● |  | ● | ● |  |  |  |',
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
    const preface = 'App Store から、サービス名で検索すると、赤いアプリが表示されます。';
    const { items, dropped } = parseCareerMarkdown(careerMarkdown(preface));

    expect(items).toHaveLength(1);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].line).toBe(preface);
    expect(dropped[0].where).toContain('士業向けマッチングアプリ');
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

    // 見出し行と本文の両方が失われるので、両方を報告する。
    expect(dropped.map((d) => d.line)).toEqual(['#### 備考', '社外秘の補足。']);
    expect(dropped.every((d) => d.where.includes('備考'))).toBe(true);
  });

  it('本文が空の未知サブセクションでも見出し行を検出する（Codexレビュー）', () => {
    // 子行が無いと、見出しだけ記録する経路が無ければ dropped が空になる。
    const { dropped } = parseCareerMarkdown(careerMarkdown('', ['', '#### 備考', ''].join('\n')));

    expect(dropped.map((d) => d.line)).toEqual(['#### 備考']);
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

  it('担当工程が正しく取り込まれ、その際に捨てた行は出ない', () => {
    const { items, dropped } = parseCareerMarkdown(careerMarkdown());

    expect(items[0].process).toEqual(['要件定義', '詳細設計', '実装']);
    expect(dropped).toEqual([]);
  });

  it('担当工程の中の自由文を検出する（Codexレビュー P1）', () => {
    const md = careerMarkdown().replace(
      '| 経験 | ● |  | ● | ● |  |  |  |',
      '補足: 一部は他社が担当。\n| 経験 | ● |  | ● | ● |  |  |  |',
    );
    const { items, dropped } = parseCareerMarkdown(md);

    // 表そのものは従来どおり読めている。
    expect(items[0].process).toEqual(['要件定義', '詳細設計', '実装']);
    expect(dropped.map((d) => d.line)).toContain('補足: 一部は他社が担当。');
    expect(dropped[0].where).toContain('担当工程');
  });

  it('担当工程の3行目以降は解釈されないので検出する（Codexレビュー P1）', () => {
    const md = careerMarkdown().replace(
      '| 経験 | ● |  | ● | ● |  |  |  |',
      '| 経験 | ● |  | ● | ● |  |  |  |\n| 補足 | ▲ |  |  |  |  |  |  |',
    );
    const { dropped } = parseCareerMarkdown(md);

    expect(dropped).toHaveLength(1);
    expect(dropped[0].line).toContain('補足');
    expect(dropped[0].where).toContain('3行目以降');
  });

  it('担当工程の未知の工程名に●が立っていれば検出する（Codexレビュー P1）', () => {
    const md = careerMarkdown().replace('| 総合テスト | 保守・運用 |', '| 総合テスト | 性能検証 |');
    const { dropped } = parseCareerMarkdown(
      md.replace('| 経験 | ● |  | ● | ● |  |  |  |', '| 経験 | ● |  | ● | ● |  |  | ● |'),
    );

    expect(dropped.map((d) => d.line).join()).toContain('性能検証');
    expect(dropped[0].where).toContain('未知の工程名');
  });

  it('同名サブセクションが重複したとき、上書きで失われる先行内容を検出する（Codexレビュー P2）', () => {
    const md = `${careerMarkdown()}\n\n#### コメント\n\n≪コメント≫\n後から書いた方だけが残ります。`;
    const { items, dropped } = parseCareerMarkdown(md);

    // 後勝ちで上書きされる挙動自体は変えていない。
    expect(items[0].comment).toContain('後から書いた方だけが残ります。');
    expect(items[0].comment).not.toContain('チームで進めた。');
    // 失われた先行内容が警告に出る。
    expect(dropped.map((d) => d.line)).toContain('チームで進めた。');
    expect(dropped.some((d) => d.where.includes('重複したサブセクション'))).toBe(true);
  });

  it.each([
    'constructor',
    'toString',
    '__proto__',
    'hasOwnProperty',
  ])('サブセクション名が Object.prototype のプロパティ名(%s)でも停止せず検出できる（Codexレビュー P2）', (name) => {
    const md = careerMarkdown('', ['', `#### ${name}`, '', '継承プロパティ名の見出しです。'].join('\n'));

    // 通常のオブジェクトを使っていると、初回にもかかわらず重複と誤判定され
    // 反復不能な値への for...of で TypeError となり移行全体が停止していた。
    expect(() => parseCareerMarkdown(md)).not.toThrow();

    const { items, dropped } = parseCareerMarkdown(md);
    expect(items).toHaveLength(1);
    expect(dropped.map((d) => d.line)).toContain('継承プロパティ名の見出しです。');
    expect(dropped.some((d) => d.where.includes('未知のサブセクション'))).toBe(true);
    // 初回なので「重複」としては報告しない。
    expect(dropped.some((d) => d.where.includes('重複したサブセクション'))).toBe(false);
  });

  it('空行と表の区切り行は捨てた行として報告しない', () => {
    const { dropped } = parseCareerMarkdown(careerMarkdown());

    expect(dropped).toEqual([]);
  });

  it('会社見出しより前の想定外の見出しを検出する（Codexレビュー）', () => {
    // `## 経歴` だけは main() が切り出しの起点にする想定済みの構造なので除外するが、
    // それ以外の見出しは本文が無くてもどのフィールドにも入らない。
    const md = careerMarkdown().replace('## 経歴', '## 経歴\n\n## 注意事項');
    const { dropped } = parseCareerMarkdown(md);

    expect(dropped.map((d) => d.line)).toContain('## 注意事項');
    expect(dropped.map((d) => d.line)).not.toContain('## 経歴');
  });

  it('担当工程の未知の工程名は ● 以外のマーカーでも検出する（Codexレビュー）', () => {
    const md = careerMarkdown()
      .replace('| 総合テスト | 保守・運用 |', '| 総合テスト | 性能検証 |')
      .replace('| 経験 | ● |  | ● | ● |  |  |  |', '| 経験 | ● |  | ● | ● |  |  | ○ |');
    const { dropped } = parseCareerMarkdown(md);

    expect(dropped.map((d) => d.line).join()).toContain('性能検証: ○');
  });

  it('既知の工程列の解釈できないマーカーを検出する（Codexレビュー）', () => {
    // 「要件定義: 担当」は process に変換されないまま失われる。
    const md = careerMarkdown().replace('| 経験 | ● |  | ● | ● |  |  |  |', '| 経験 | 担当 |  |  |  |  |  |  |');
    const { items, dropped } = parseCareerMarkdown(md);

    expect(items[0].process).toEqual([]);
    expect(dropped.map((d) => d.line)).toContain('要件定義: 担当');
    expect(dropped[0].where).toContain('解釈できないマーカー');
  });

  it('「経験なし」記号は解釈できないマーカーとして報告しない（誤検知しない）', () => {
    const md = careerMarkdown().replace('| 経験 | ● |  | ● | ● |  |  |  |', '| 経験 | ● | - | ● | ● | × | ー | なし |');
    const { items, dropped } = parseCareerMarkdown(md);

    expect(items[0].process).toEqual(['要件定義', '詳細設計', '実装']);
    expect(dropped).toEqual([]);
  });

  it('ヘッダより列数が多いデータ行の余剰セルを検出する（CodeRabbitレビュー）', () => {
    const md = careerMarkdown().replace(
      '| 経験 | ● |  | ● | ● |  |  |  |',
      '| 経験 | ● |  | ● | ● |  |  |  | 補足あり |',
    );
    const { dropped } = parseCareerMarkdown(md);

    expect(dropped.map((d) => d.line)).toContain('補足あり');
    expect(dropped[0].where).toContain('ヘッダに対応する列が無い');
  });
});

describe('parseCareerMarkdown（会社見出しの期間）', () => {
  it('会社の期間は原文のまま保持する（範囲区切りが 〜 の通常ケース）', () => {
    const md = careerMarkdown().replace(
      '### 株式会社サンプル - 2020年4月 - 現在',
      '### 株式会社サンプル - 2020年4月〜現在',
    );
    const { companies } = parseCareerMarkdown(md);

    expect(companies[0].period).toBe('2020年4月〜現在');
  });

  it('単月表記（範囲区切りが無い）でも "2024.1" のようなドット表記へ化けない（#245 回帰）', () => {
    // I社は "2024年1月" の単月のみで、範囲を表す区切り文字を含まない。
    // normalizePeriod（item.period 用）を誤って会社の期間にも適用すると、
    // normalizeDateToken の単一トークン正規表現にそのままマッチして "2024.1" になっていた。
    const md = careerMarkdown().replace('### 株式会社サンプル - 2020年4月 - 現在', '### 株式会社サンプル - 2024年1月');
    const { companies } = parseCareerMarkdown(md);

    expect(companies[0].period).toBe('2024年1月');
  });
});

describe('parseCareerMarkdown（プロジェクト概要の重複）', () => {
  it('単一値フィールドが重複したとき、上書きで失われる先行値を検出する（Codexレビュー）', () => {
    const md = careerMarkdown().replace(
      '| 役割 | **バックエンド** |',
      '| 役割 | **バックエンド** |\n| 役割 | **フロントエンド** |',
    );
    const { items, dropped } = parseCareerMarkdown(md);

    // 後勝ちで上書きされる挙動自体は変えていない。
    expect(items[0].role).toBe('フロントエンド');
    expect(dropped.map((d) => d.line)).toContain('役割: バックエンド');
    expect(dropped[0].where).toContain('重複した項目の上書き');
  });
});

describe('parseCareerMarkdown（列数のずれ）', () => {
  it('技術スタックの3列目以降を検出する（Codexレビュー）', () => {
    // parseTableRow は貪欲なので row 自体は取れてしまい、!row では検出できない。
    const md = careerMarkdown().replace('| 言語 | TypeScript, Go |', '| 使用言語 | TypeScript | 業務利用 |');
    const { items, dropped } = parseCareerMarkdown(md);

    // 誤って tools に 業務利用 だけが入る挙動を止め、行ごと警告に回す。
    expect(items[0].tech.tools).not.toContain('業務利用');
    expect(dropped.map((d) => d.line)).toContain('| 使用言語 | TypeScript | 業務利用 |');
    expect(dropped[0].where).toContain('列が2つを超える');
  });

  it('担当工程で見出しが空の列の値を検出する（Codexレビュー）', () => {
    const md = careerMarkdown()
      .replace('| 総合テスト | 保守・運用 |', '| 総合テスト |  |')
      .replace('| 経験 | ● |  | ● | ● |  |  |  |', '| 経験 | ● |  | ● | ● |  |  | 担当 |');
    const { dropped } = parseCareerMarkdown(md);

    expect(dropped.map((d) => d.line).join()).toContain('担当');
    expect(dropped[0].where).toContain('未知の工程名');
  });
});

describe('parseCareerMarkdown（担当工程の取りこぼし）', () => {
  it('●に付随する注記を検出する（Codexレビュー）', () => {
    const md = careerMarkdown().replace(
      '| 経験 | ● |  | ● | ● |  |  |  |',
      '| 経験 | ●（一部担当） |  | ● | ● |  |  |  |',
    );
    const { items, dropped } = parseCareerMarkdown(md);

    // 工程そのものは従来どおり取り込む。
    expect(items[0].process).toEqual(['要件定義', '詳細設計', '実装']);
    expect(dropped.map((d) => d.line).join()).toContain('一部担当');
    expect(dropped[0].where).toContain('●に付随する注記');
  });

  it('先頭セルに紛れた注記を検出する（Codexレビュー）', () => {
    const md = careerMarkdown().replace('| 経験 | ● |', '| 経験（主担当） | ● |');
    const { items, dropped } = parseCareerMarkdown(md);

    expect(items[0].process).toEqual(['要件定義', '詳細設計', '実装']);
    expect(dropped.map((d) => d.line)).toContain('経験（主担当）');
    expect(dropped[0].where).toContain('想定外の行ラベル');
  });

  it('区切り行に紛れた値を検出する（Codexレビュー）', () => {
    const md = careerMarkdown().replace('|---|---|---|---|---|---|---|---|', '|---|---|重要注記|---|---|---|---|---|');
    const { items, dropped } = parseCareerMarkdown(md);

    expect(items[0].process).toEqual(['要件定義', '詳細設計', '実装']);
    expect(dropped.map((d) => d.line)).toContain('重要注記');
    expect(dropped[0].where).toContain('区切り行に紛れた値');
  });

  it('標準的な 工程 / 経験 の先頭セルは報告しない（誤検知しない）', () => {
    const { dropped } = parseCareerMarkdown(careerMarkdown());

    expect(dropped).toEqual([]);
  });
});

describe('isTableSeparatorRow', () => {
  it.each([
    ['|---|---|', true],
    ['| :--- | ---: |', true],
    ['| 期間 | 2021年 |', false],
    ['ふつうの文', false],
  ])('%s → %s', (line, expected) => {
    expect(isTableSeparatorRow(line)).toBe(expected);
  });
});

// --- プロフィール／スキル ------------------------------------------------------------------
const PROFILE_MD = [
  '## 技術者プロファイル',
  '',
  '| 項目 | 内容 |',
  '|---|---|',
  '| 技術者名 | 山田太郎 |',
  '| 年齢 | 30歳 |',
  '',
  '### 自己 PR',
  '',
  'ここは pr へそのまま入るので、表でなくても捨てた行にはなりません。',
].join('\n');

const SKILLS_MD = [
  '<details>',
  '<summary><h2>スキル・経験年数</h2></summary>',
  '',
  '| 技術分類 | 技術名 | 経験年数 |',
  '|---|---|---|',
  '| 言語 | TypeScript | 5年 |',
  '|  | Go | 2年 |',
  '',
  '</details>',
].join('\n');

describe('parseProfileMarkdown', () => {
  it('正常なプロフィールでは1行も捨てない（誤検知しない）', () => {
    const dropped: DroppedLine[] = [];
    const profile = parseProfileMarkdown(PROFILE_MD, dropped);

    expect(profile?.name).toBe('山田太郎');
    expect(profile?.meta.age).toBe('30歳');
    expect(profile?.pr).toContain('pr へそのまま入る');
    expect(dropped).toEqual([]);
  });

  it('switch のどの case にも当たらないラベルを検出する（Codexレビュー P1）', () => {
    const dropped: DroppedLine[] = [];
    const profile = parseProfileMarkdown(PROFILE_MD.replace('| 年齢 | 30歳 |', '| 居住地 | 東京 |'), dropped);

    // 居住地は ProfileMeta のどこにも入らない。
    expect(profile?.meta.age).toBeUndefined();
    expect(dropped.map((d) => d.line)).toContain('居住地: 東京');
    expect(dropped[0].where).toContain('技術者プロファイル');
  });

  it('自己PR見出しより前の非テーブル行を検出する（Codexレビュー P1）', () => {
    const dropped: DroppedLine[] = [];
    parseProfileMarkdown(
      PROFILE_MD.replace('| 項目 | 内容 |', '備考: この行は取り込まれません。\n| 項目 | 内容 |'),
      dropped,
    );

    expect(dropped.map((d) => d.line)).toContain('備考: この行は取り込まれません。');
  });

  it('同じ項目が重複したとき、上書きで失われる先行値を検出する（Codexレビュー）', () => {
    const dropped: DroppedLine[] = [];
    const profile = parseProfileMarkdown(
      PROFILE_MD.replace('| 年齢 | 30歳 |', '| 年齢 | 30歳 |\n| 年齢 | 40歳 |'),
      dropped,
    );

    // 後勝ちで上書きされる挙動自体は変えていない。
    expect(profile?.meta.age).toBe('40歳');
    expect(dropped.map((d) => d.line)).toContain('年齢: 30歳');
    expect(dropped[0].where).toContain('重複した項目の上書き');
  });
});

describe('parseSkillsMarkdown', () => {
  it('正常なスキル表では1行も捨てない（誤検知しない）', () => {
    const dropped: DroppedLine[] = [];
    const skills = parseSkillsMarkdown(SKILLS_MD, dropped);

    expect(skills).toHaveLength(1);
    expect(skills[0].skills.map((s) => s.name)).toEqual(['TypeScript', 'Go']);
    expect(dropped).toEqual([]);
  });

  it('スキルセクション内の非テーブル行を検出する（Codexレビュー P1）', () => {
    const dropped: DroppedLine[] = [];
    parseSkillsMarkdown(
      SKILLS_MD.replace('| 言語 | TypeScript | 5年 |', '注記: 一部は独学です。\n| 言語 | TypeScript | 5年 |'),
      dropped,
    );

    expect(dropped.map((d) => d.line)).toContain('注記: 一部は独学です。');
    expect(dropped[0].where).toContain('スキル・経験年数');
  });

  it('列が3つ未満の行を検出する（CodeRabbitレビュー）', () => {
    const dropped: DroppedLine[] = [];
    parseSkillsMarkdown(SKILLS_MD.replace('| 言語 | TypeScript | 5年 |', '| 言語 | TypeScript |'), dropped);

    expect(dropped.map((d) => d.line)).toContain('| 言語 | TypeScript |');
    expect(dropped[0].where).toContain('列が3つ未満');
  });

  it('技術分類も技術名も無く経験年数だけの行を検出する（CodeRabbitレビュー）', () => {
    const dropped: DroppedLine[] = [];
    parseSkillsMarkdown(SKILLS_MD.replace('|  | Go | 2年 |', '|  |  | 2年 |'), dropped);

    expect(dropped.some((d) => d.where.includes('技術名が無い'))).toBe(true);
  });

  it('技術分類が未確定のまま現れたスキル行を検出する（Codexレビュー P1）', () => {
    // 先頭データ行に分類が無いと currentCategory が空のままで、flushCategory が
    // ブロックを出さず次の分類行で消える。
    const dropped: DroppedLine[] = [];
    const skills = parseSkillsMarkdown(
      SKILLS_MD.replace('| 言語 | TypeScript | 5年 |', '|  | TypeScript | 5年 |'),
      dropped,
    );

    expect(skills.flatMap((s) => s.skills.map((x) => x.name))).not.toContain('TypeScript');
    expect(dropped.some((d) => d.where.includes('技術分類が未確定'))).toBe(true);
    expect(dropped.map((d) => d.line).join()).toContain('TypeScript');
  });

  it('想定外のHTML見出しは構造行として除外しない（Codexレビュー）', () => {
    // タグ名だけで除外していると <h3>補足</h3> のような内容行を見逃す。
    const dropped: DroppedLine[] = [];
    parseSkillsMarkdown(
      SKILLS_MD.replace('| 技術分類 | 技術名 | 経験年数 |', '<h3>補足</h3>\n| 技術分類 | 技術名 | 経験年数 |'),
      dropped,
    );

    expect(dropped.map((d) => d.line)).toContain('<h3>補足</h3>');
  });

  it('<details> 内の ## 見出し以降も検査する（Codexレビュー）', () => {
    // 見出しでの打ち切りはフォールバック経路限定。<details> があるときに適用すると逆に取りこぼす。
    const dropped: DroppedLine[] = [];
    parseSkillsMarkdown(SKILLS_MD.replace('</details>', '## 補足\n\nここは取り込まれません。\n\n</details>'), dropped);

    expect(dropped.map((d) => d.line)).toContain('ここは取り込まれません。');
  });

  it('4列目以降の値を検出する（Codexレビュー）', () => {
    const dropped: DroppedLine[] = [];
    const skills = parseSkillsMarkdown(
      SKILLS_MD.replace('| 言語 | TypeScript | 5年 |', '| 言語 | TypeScript | 5年 | 業務利用 |'),
      dropped,
    );

    // 先頭3セルは従来どおり読めている。
    expect(skills[0].skills[0]).toMatchObject({ name: 'TypeScript', years: 5 });
    expect(dropped.map((d) => d.line)).toContain('業務利用');
    expect(dropped[0].where).toContain('4列目以降');
  });

  it.each([
    '6ヶ月',
    '1年未満',
    '1年6ヶ月',
    '約1年',
    '5年以上',
    '経験あり',
  ])('N年形式でない経験年数「%s」を検出する（Codexレビュー）', (raw) => {
    // 部分一致だと 1年未満 / 1年6ヶ月 / 約1年 / 5年以上 が先頭の数字だけ拾い、
    // 付加情報を失ったまま警告も出なかった。完全一致に変えて全て検出する。
    const dropped: DroppedLine[] = [];
    const skills = parseSkillsMarkdown(
      SKILLS_MD.replace('| 言語 | TypeScript | 5年 |', `| 言語 | TypeScript | ${raw} |`),
      dropped,
    );

    expect(skills[0].skills[0].years).toBe(0);
    expect(dropped.map((d) => d.line)).toContain(`TypeScript: ${raw}`);
    expect(dropped[0].where).toContain('経験年数を解釈できない');
  });

  it('N年形式の経験年数は従来どおり取り込み、警告しない（誤検知しない）', () => {
    const dropped: DroppedLine[] = [];
    const skills = parseSkillsMarkdown(SKILLS_MD, dropped);

    expect(skills[0].skills[0]).toMatchObject({ name: 'TypeScript', years: 5 });
    expect(dropped).toEqual([]);
  });

  it('スキルが1件も無い技術分類を検出する（Codexレビュー）', () => {
    // 分類行だけがあり、次の分類まで技術名が現れないと flushCategory が黙って捨てる。
    const md = [
      '<details>',
      '<summary><h2>スキル・経験年数</h2></summary>',
      '',
      '| 技術分類 | 技術名 | 経験年数 |',
      '|---|---|---|',
      '| インフラ |  |  |',
      '| 言語 | TypeScript | 5年 |',
      '',
      '</details>',
    ].join('\n');
    const dropped: DroppedLine[] = [];
    const skills = parseSkillsMarkdown(md, dropped);

    expect(skills.map((s) => s.category)).toEqual(['言語']);
    expect(dropped.some((d) => d.where.includes('スキルが1件も無い技術分類'))).toBe(true);
    expect(dropped.map((d) => d.line).join()).toContain('インフラ');
  });

  it('技術分類がある行でも技術名が無ければ経験年数を検出する（Codexレビュー）', () => {
    // `| 言語 |  | 5年 |` の後にスキル行が続くと空分類検査も発火せず 5年 が消えていた。
    const md = SKILLS_MD.replace('| 言語 | TypeScript | 5年 |', '| 言語 |  | 5年 |\n| | TypeScript | 3年 |');
    const dropped: DroppedLine[] = [];
    parseSkillsMarkdown(md, dropped);

    expect(dropped.map((d) => d.line)).toContain('| 言語 |  | 5年 |');
    expect(dropped[0].where).toContain('技術名が無い');
  });

  it('セクション名を含むだけの想定外見出しは構造行として除外しない（Codexレビュー）', () => {
    // 部分一致だと「スキル・経験年数の注意事項」まで構造行と誤判定して見逃す。
    const dropped: DroppedLine[] = [];
    parseSkillsMarkdown(
      SKILLS_MD.replace(
        '| 技術分類 | 技術名 | 経験年数 |',
        '<h3>スキル・経験年数の注意事項</h3>\n| 技術分類 | 技術名 | 経験年数 |',
      ),
      dropped,
    );

    expect(dropped.map((d) => d.line)).toContain('<h3>スキル・経験年数の注意事項</h3>');
  });

  it('<summary> などの構造行は捨てた行として報告しない（Codexレビュー P2）', () => {
    // 実シートと同じ <details><summary><h2>…</h2></summary> 形式でも誤検知しないこと。
    const dropped: DroppedLine[] = [];
    parseSkillsMarkdown(SKILLS_MD, dropped);

    expect(dropped).toEqual([]);
  });

  it('<details> が無い場合でも、次の ## 見出し以降を捨てた行として報告しない', () => {
    // endIdx が文末まで伸びる経路。経歴セクション全体を警告に載せてしまわないことの確認。
    const md = [
      '## スキル・経験年数',
      '',
      '| 技術分類 | 技術名 | 経験年数 |',
      '|---|---|---|',
      '| 言語 | TypeScript | 5年 |',
      '',
      '## 経歴',
      '',
      'ここは経歴セクションなのでスキル側の警告対象外です。',
      '### 株式会社サンプル - 2020年4月 - 現在',
    ].join('\n');
    const dropped: DroppedLine[] = [];
    const skills = parseSkillsMarkdown(md, dropped);

    expect(skills[0].skills.map((s) => s.name)).toEqual(['TypeScript']);
    expect(dropped.map((d) => d.line)).not.toContain('ここは経歴セクションなのでスキル側の警告対象外です。');
    expect(dropped).toEqual([]);
  });
});
