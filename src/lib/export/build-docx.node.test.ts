// node 環境（vitest.config.pdf.ts 側）で実行する。docx パッケージは jsdom 前提の
// 画面テストから除外されるため `*.node.test.tsx` 命名に合わせる。
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import type { Block, ProjectItem } from '@/db/block';

import { buildSkillSheetDocx } from './build-docx';

const tech = (over: Partial<ProjectItem['tech']> = {}): ProjectItem['tech'] => ({
  lang: [],
  fw: [],
  db: [],
  infra: [],
  tools: [],
  collab: [],
  ...over,
});

const item = (over: Partial<ProjectItem>): ProjectItem => ({
  id: 'i',
  companyId: 'c1',
  title: '案件',
  scope: '',
  period: '2024.1 — 2024.12',
  role: 'エンジニア',
  team: '5 名',
  tech: tech(),
  process: [],
  duties: '',
  acquired: '',
  comment: '',
  ...over,
});

const profileBlock: Block = {
  id: 'b-profile',
  type: 'profile',
  order: 0,
  data: {
    name: '山田 太郎',
    title: 'エンジニア',
    pr: '自己PRの本文',
    strengths: [],
    company: '株式会社サンプル',
    meta: {
      age: '30歳',
      gender: '男',
      qualifications: '基本情報技術者',
      education: '高卒',
      work: 'フルリモート',
      station: '東京',
      specialties: 'React, TypeScript',
      expertise: 'Web 開発',
    },
  },
};

const skillsBlock = (
  category: string,
  skills: { name: string; level: string; years: number }[],
  order: number,
): Block => ({
  id: `b-skills-${order}`,
  type: 'skills',
  order,
  data: { category, skills },
});

const statsBlock: Block = {
  id: 'b-stats',
  type: 'stats',
  order: 3,
  data: { items: [{ value: '8', unit: '年', label: 'エンジニア歴' }] },
};

const projectBlock = (items: ProjectItem[], companies: { id: string; name: string; hidden?: boolean }[]): Block => ({
  id: 'b-project',
  type: 'project',
  order: 4,
  data: {
    companies: companies.map((c) => ({ kind: '', period: '', note: '', ...c })),
    items,
  },
});

const unzipDocx = async (buf: Buffer) => {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('word/document.xml not found');
  return { zip, xml };
};

// w:t のテキストだけを連結して検査用文字列にする（XML エスケープを戻す）。
const documentText = (xml: string): string =>
  [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
    .map((m) => m[1])
    .join('\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

describe('buildSkillSheetDocx', () => {
  it('docx として開ける構造を持ち、プロフィール・スキル・案件が全件書かれる', async () => {
    const newest = item({
      id: 'i-new',
      title: '新しい案件',
      period: '2026.8 — 現在',
      ongoing: true,
      role: 'フロントエンドエンジニア',
      team: '13 名',
      summary: '概要の本文',
      duties: '- やったこと\n**太字**の文',
      acquired: '- 学んだこと',
      comment: 'コメントの本文',
      process: ['実装', '運用・保守'],
      tech: tech({
        lang: ['TypeScript'],
        infra: ['AWS ECS'],
        fw: ['Next.js'],
        tools: ['Vitest'],
        collab: ['Slack'],
      }),
    });
    const older = item({ id: 'i-old', title: '古い案件', period: '2024.1 — 2024.12', process: ['要件定義'] });
    const blocks: Block[] = [
      profileBlock,
      skillsBlock(
        '言語',
        [
          { name: 'TypeScript', level: '上級', years: 8 },
          { name: 'Python', level: '中級', years: 4 },
        ],
        1,
      ),
      skillsBlock('データベース', [{ name: 'PostgreSQL', level: '中級', years: 4 }], 2),
      statsBlock,
      // markdown 経路は viewer/PDF と同じくブロック内の案件順をそのまま出す。
      projectBlock([newest, older], [{ id: 'c1', name: 'C社' }]),
    ];

    const buf = await buildSkillSheetDocx(blocks, 'テストシート', 2026 * 12 + 11);
    // zip 署名（PK）と必須エントリ
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
    const { zip, xml } = await unzipDocx(buf);
    expect(zip.file('[Content_Types].xml')).toBeTruthy();

    const text = documentText(xml);
    // タイトル・プロフィール
    expect(text).toContain('テストシート');
    expect(text).toContain('山田 太郎');
    expect(text).toContain('株式会社サンプル');
    expect(text).toContain('30歳');
    expect(text).toContain('基本情報技術者');
    expect(text).toContain('フルリモート');
    expect(text).toContain('自己PRの本文');
    // 統計（referenceMonth 指定時は viewer と同じく導出値になるためラベルのみ見る）
    expect(text).toContain('エンジニア歴');
    // スキル（全カテゴリ・全件。省略形 '他 N 件' は出さない）
    for (const s of ['TypeScript', 'Python', 'PostgreSQL', '言語', 'データベース', '上級', '中級']) {
      expect(text).toContain(s);
    }
    expect(text).not.toMatch(/他\s*\d+\s*件/);
    // 案件はブロックの保存順（viewer/PDF と同じ順）で出る
    const newestPos = text.indexOf('新しい案件');
    const olderPos = text.indexOf('古い案件');
    expect(newestPos).toBeGreaterThan(-1);
    expect(olderPos).toBeGreaterThan(newestPos);
    expect(text).toContain('C社');
    expect(text).toContain('フロントエンドエンジニア');
    expect(text).toContain('13 名');
    for (const s of ['TypeScript', 'Next.js', 'AWS ECS', 'Vitest', 'Slack']) expect(text).toContain(s);
    for (const s of ['概要の本文', 'やったこと', '太字', '学んだこと', 'コメントの本文']) {
      expect(text).toContain(s);
    }
    // 担当工程（7段モデルのラベルで出る）
    expect(text).toContain('実装・単体');
    expect(text).toContain('保守・運用');
    expect(text).toContain('要件定義');
  });

  it('太字・見出し・改行・表が docx の構造として出る', async () => {
    const mdBlock: Block = {
      id: 'b-md',
      type: 'markdown',
      order: 0,
      data: { markdown: '## セクション見出し\n\n本文に**強調**と\n単一改行と\n\n- 箇条書き' },
    };
    const buf = await buildSkillSheetDocx([mdBlock], '構造テスト');
    const { xml } = await unzipDocx(buf);

    // 見出し: Heading スタイル + 太字ラン
    expect(xml).toContain('w:val="Heading');
    expect(xml).toContain('<w:b/>');
    // 箇条書き: numPr か bullet
    expect(xml).toMatch(/<w:numPr>|<w:buChar/);
    // 表: プロフィール等が無くても skills 表も無いため markdown テーブルで確認する
    const tableMd: Block = {
      id: 'b-tbl',
      type: 'markdown',
      order: 0,
      data: { markdown: '| A | B |\n| --- | --- |\n| 1 | 2 |' },
    };
    const tblBuf = await buildSkillSheetDocx([tableMd], '表テスト');
    const tblXml = (await unzipDocx(tblBuf)).xml;
    expect(tblXml).toContain('<w:tbl>');
    expect(tblXml).toContain('<w:tblHeader');
    // 改行: soft break は <w:br/> になる
    const softBreakXml = (await unzipDocx(await buildSkillSheetDocx([mdBlock], 'x'))).xml;
    expect(softBreakXml).toContain('<w:br/>');
  });

  it('hidden な案件・hidden な会社配下の案件を出力しない', async () => {
    const visible = item({ id: 'i-vis', title: '表示案件', period: '2026.8 — 現在' });
    const hiddenItem = item({ id: 'i-hid', title: '非表示案件', period: '2026.7 — 現在', hidden: true });
    const underHiddenCompany = item({
      id: 'i-uh',
      title: '非表示会社の案件',
      period: '2026.6 — 現在',
      companyId: 'c-hidden',
    });
    const buf = await buildSkillSheetDocx(
      [
        projectBlock(
          [visible, hiddenItem, underHiddenCompany],
          [
            { id: 'c1', name: 'C社' },
            { id: 'c-hidden', name: '隠し会社', hidden: true },
          ],
        ),
      ],
      'x',
    );
    const text = documentText((await unzipDocx(buf)).xml);

    expect(text).toContain('表示案件');
    expect(text).not.toContain('非表示案件');
    expect(text).not.toContain('非表示会社の案件');
    expect(text).not.toContain('隠し会社');
  });

  it('ヘッダよりセル数の多い行を含む表でも落ちず、ordered list は各リストで採番がリセットされる', async () => {
    // GFM 表は行ごとのセル数が不一致になりうる。先頭行基準の列幅だと
    // はみ出たセルで width undefined → TableCell 例外（500）になっていた。
    const ragged: Block = {
      id: 'b-ragged',
      type: 'markdown',
      order: 0,
      data: { markdown: '| A | B |\n| --- | --- |\n| 1 | 2 |\n| x | y | z | extra |' },
    };
    const buf = await buildSkillSheetDocx([ragged], '表');
    const { xml } = await unzipDocx(buf);
    expect(documentText(xml)).toContain('extra');

    // 同一 numbering reference だけだと Word では全 ordered list が連続採番になる。
    // リストごとに numbering instance を分け、各リストが 1 始まりになることを numId で見る。
    const twoLists: Block = {
      id: 'b-lists',
      type: 'markdown',
      order: 0,
      data: { markdown: '1. a\n2. b\n\n段落区切り\n\n1. c\n2. d\n3. e' },
    };
    const listXml = (await unzipDocx(await buildSkillSheetDocx([twoLists], 'x'))).xml;
    const numIds = [...listXml.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]);
    expect(numIds.length).toBe(5);
    expect(new Set(numIds).size).toBe(2);
  });

  it('XML 1.0 不許可の制御文字を除去し、深いリスト入れ子・先頭非段落の item でも壊れない', async () => {
    const md = (markdown: string): Block => ({
      id: `b-${markdown.length}`,
      type: 'markdown',
      order: 0,
      data: { markdown },
    });
    const docXmlOf = async (b: Block) => (await unzipDocx(await buildSkillSheetDocx([b], 't\x0bitle'))).xml;
    const numPrCount = (xml: string) => (xml.match(/<w:numPr>/g) ?? []).length;

    // \x0b 等の制御文字は document.xml / core.xml を破損させる（Word が開けない）
    // → 有効な XML が生成されることを parse で確認する（JSZip で十分: 生文字が残れば well-formed でない）。
    const xml = await docXmlOf(md('VTここ\x0bタブ\x09だけ残る\x01'));
    const badChars = [...xml].filter((c) => {
      const n = c.codePointAt(0) ?? 0;
      return n < 0x20 && n !== 0x9 && n !== 0xa && n !== 0xd;
    });
    expect(badChars).toEqual([]);
    expect(documentText(xml)).toContain('VTここ');
    expect(documentText(xml)).toContain('タブ');

    // 11 段ネストは docx の ilvl 上限（0-8）を超えて throw していた → クランプして 500 を防ぐ
    const deep = await docXmlOf(
      md(
        '1. a\n   1. b\n      1. c\n         1. d\n            1. e\n               1. f\n                  1. g\n                     1. h\n                        1. i\n                           1. j\n                              1. k',
      ),
    );
    const levels = [...deep.matchAll(/<w:ilvl w:val="(\d+)"\/>/g)].map((m) => Number(m[1]));
    expect(Math.max(...levels)).toBeLessThanOrEqual(8);

    // item 先頭が blockquote なら bullet は先頭段落 1 個だけ（全段落に漏れない）
    const quote = await docXmlOf(md('- > q1\n  >\n  > q2\n- n'));
    expect(numPrCount(quote)).toBe(2);

    // item 先頭が code fence でも item のマーカーが消えない
    const codeFirst = await docXmlOf(md('- ```\n  code\n  ```\n- n'));
    expect(numPrCount(codeFirst)).toBe(2);

    // 兄弟サブリストは別 concrete instance（各々 1 始まり。PDF の各リスト `${i+1}.` と同じ parity）
    // 親 2 項目 + サブリスト 2+2 で numId は親/サブ1/サブ2 の 3 種類
    const nestedOrdered = await docXmlOf(md('1. a\n   1. x\n   2. y\n2. b\n   1. p\n   2. q'));
    const nestedIds = [...nestedOrdered.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]);
    expect(nestedIds.length).toBe(6);
    expect(new Set(nestedIds).size).toBe(3);

    // unordered 配下の ordered 兄弟も別 instance（undefined instance 共有で 3,4 続きになる問題の回帰）
    const underBullet = await docXmlOf(md('- 1. x\n  2. y\n\n- 1. p\n  2. q'));
    const underBulletIds = [...underBullet.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]);
    expect(new Set(underBulletIds).size).toBe(3); // 親 bullet + ordered×2

    // 先頭が numPr を持てない形状でも item マーカーが残る
    // （thematicBreak は item の先頭子になれない: '- ---' はリストを抜けてトップレベルの横線になる）
    expect(numPrCount(await docXmlOf(md('- | A |\n  | - |\n- n')))).toBe(2); // table
    expect(numPrCount(await docXmlOf(md('- <hr>\n- n')))).toBe(2); // html が空に strip
    expect(numPrCount(await docXmlOf(md('- - deep\n- n')))).toBe(3); // 外item空マーカー + deep + n
  });
});
