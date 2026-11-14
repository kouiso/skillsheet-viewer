import { describe, expect, it } from 'vitest';
import type { Block } from '@/db/block';
import { COMPANY_FIELD_LABELS, PROJECT_FIELD_LABELS, TECH_FIELD_LABELS } from './field-labels';
import { documentDifferences, formatLocation } from './version-diff';

type Tech = { lang: string[]; fw: string[]; db: string[]; infra: string[]; tools: string[]; collab: string[] };
const tech = (over: Partial<Tech> = {}): Tech => ({
  lang: [],
  fw: [],
  db: [],
  infra: [],
  tools: [],
  collab: [],
  ...over,
});
const project = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  companyId: 'c1',
  title: '決済基盤の開発',
  scope: 'バックエンド',
  period: '2020/01〜2021/03',
  role: 'バックエンド',
  team: '5',
  tech: tech(),
  process: [],
  duties: '設計',
  acquired: '',
  comment: '',
  ...over,
});
const projectBlock = (
  items: unknown[],
  companies: unknown[] = [{ id: 'c1', name: '株式会社A', kind: '事業会社', period: '', note: '' }],
) => ({ id: 'b1', type: 'project', order: 0, data: { companies, items } }) as unknown as Block;
const doc = (...blocks: unknown[]) => ({ title: 'シート', blocks });
const loc = (d: { location: string[] }) => formatLocation(d.location);

describe('版の差分: 場所の組み立て', () => {
  it('案件の項目は、添字でなく会社名と案件名で場所を示す', () => {
    const result = documentDifferences(
      doc(projectBlock([project(), project({ id: 'p2', title: '管理画面' })])),
      doc(projectBlock([project(), project({ id: 'p2', title: '管理画面', duties: '画面の実装' })])),
    );
    expect(result).toHaveLength(1);
    expect(loc(result[0])).toBe('株式会社A › 管理画面 › 担当業務');
    expect(result[0].location.join('')).not.toMatch(/\d番目|blocks|items/);
  });

  it('スキルは「スキル › カテゴリ › スキル名 › 項目」で示す', () => {
    const skills = (years: number) => ({
      id: 's',
      type: 'skills',
      order: 0,
      data: {
        category: '言語',
        skills: [
          { name: 'Go', years: 1, level: '中' },
          { name: 'TypeScript', years, level: '上' },
        ],
      },
    });
    const [d] = documentDifferences(doc(skills(3)), doc(skills(5)));
    expect(loc(d)).toBe('スキル › 言語 › TypeScript › 経験年数');
    expect([d.before, d.after]).toEqual(['3', '5']);
  });

  it('会社の項目・技術スタック・所属会社（名前に解決する）', () => {
    const companies = (name: string) => [
      { id: 'c1', name, kind: '事業会社', period: '', note: '' },
      { id: 'c2', name: '株式会社B', kind: '受託', period: '', note: '' },
    ];
    const before = doc(projectBlock([project({ tech: tech({ lang: ['Go'] }) })], companies('株式会社A')));
    const after = doc(
      projectBlock([project({ companyId: 'c2', tech: tech({ lang: ['Go', 'Rust'] }) })], companies('株式会社A改')),
    );
    const result = documentDifferences(before, after);
    const by = (label: string) => result.find((d) => d.location.at(-1) === label);
    expect(loc(by(COMPANY_FIELD_LABELS.name) as never)).toBe('会社 › 株式会社A改 › 会社名');
    expect(by(TECH_FIELD_LABELS.lang)).toMatchObject({ before: 'Go', after: 'Go、Rust' });
    const company = by(PROJECT_FIELD_LABELS.companyId);
    expect(company).toMatchObject({ before: '株式会社A', after: '株式会社B' });
    expect(loc(company as never)).toBe('株式会社B › 決済基盤の開発 › 所属会社');
  });

  it('名前が空の時は、空の場所を出さず、未入力と分かる語を出す', () => {
    const [d] = documentDifferences(
      doc(
        projectBlock([project({ title: '', duties: 'a' })], [{ id: 'c1', name: '', kind: '', period: '', note: '' }]),
      ),
      doc(
        projectBlock([project({ title: '', duties: 'b' })], [{ id: 'c1', name: '', kind: '', period: '', note: '' }]),
      ),
    );
    expect(loc(d)).toBe('(会社名未入力) › （案件名未入力） › 担当業務');
  });
});

describe('版の差分: 項目名の対応表', () => {
  it('案件の項目名は編集画面と同じ語（概要・役割・習得スキル・コメント）', () => {
    const result = documentDifferences(
      doc(projectBlock([project({ summary: 'a', role: 'PM', acquired: 'x', comment: 'y' })])),
      doc(projectBlock([project({ summary: 'b', role: 'PL', acquired: 'z', comment: 'w' })])),
    );
    expect(result.map((d) => d.location.at(-1))).toEqual(['役割', '習得スキル', 'コメント', '概要']);
    expect(PROJECT_FIELD_LABELS).toMatchObject({
      summary: '概要',
      role: '役割',
      acquired: '習得スキル',
      comment: 'コメント',
    });
  });

  it('値が真偽値でも、内部の語（true/false）でなく画面の語で出す', () => {
    const [d] = documentDifferences(
      doc(projectBlock([project({ hidden: false })])),
      doc(projectBlock([project({ hidden: true })])),
    );
    expect(loc(d)).toBe('株式会社A › 決済基盤の開発 › 閲覧側の表示');
    expect([d.before, d.after]).toEqual(['表示', '非表示']);
  });
});

describe('版の差分: 文字列の出し方', () => {
  it('文字列は引用符なし・改行そのまま、空白だけの差も隠さない', () => {
    const md = (markdown: string) => ({ id: 'm', type: 'markdown', order: 0, data: { markdown } });
    const [d] = documentDifferences(doc(md('x\n')), doc(md('x\n\n')));
    expect(d.before).toBe('x\n');
    expect(d.after).toBe('x\n\n');
    expect(d.before + d.after).not.toContain('"');
  });

  it('文字列の配列は並び順の違いも1項目として出す', () => {
    const [d] = documentDifferences(
      doc(projectBlock([project({ tech: tech({ lang: ['A', 'B'] }) })])),
      doc(projectBlock([project({ tech: tech({ lang: ['B', 'A'] }) })])),
    );
    expect([d.before, d.after]).toEqual(['A、B', 'B、A']);
  });

  it('タイトルの変更', () => {
    const [d] = documentDifferences({ title: '旧', blocks: [] }, { title: '新', blocks: [] });
    expect(loc(d)).toBe('シート › タイトル');
    expect([d.before, d.after]).toEqual(['旧', '新']);
  });
});

describe('版の差分: 追加・削除されたブロック', () => {
  const added = projectBlock([project({ duties: '新規の担当業務', acquired: '' })]);
  const result = documentDifferences(doc(), doc(added));
  const text = JSON.stringify(result);

  it('JSON・内部IDを出さない', () => {
    for (const d of result) {
      expect(`${d.before}${d.after}${loc(d)}`).not.toMatch(/[{}[\]]|"|\bb1\b|\bp1\b|\bc1\b/);
    }
    expect(text).not.toContain('"id"');
  });

  it('追加されたブロックの項目を、省略せず全部並べる', () => {
    const labels = result.map((d) => d.location.at(-1));
    expect(labels).toEqual(
      expect.arrayContaining(['ブロックの種類', '会社名', '案件タイトル', '担当業務', '役割', '期間']),
    );
    const duties = result.find((d) => d.location.at(-1) === '担当業務');
    expect([duties?.before, duties?.after]).toEqual(['（なし）', '新規の担当業務']);
    expect(result.find((d) => d.location.at(-1) === 'ブロックの種類')?.after).toBe('経歴（案件）');
  });

  it('削除されたブロックは、前の値だけが読める形で出る', () => {
    const removed = documentDifferences(doc(added), doc());
    const duties = removed.find((d) => d.location.at(-1) === '担当業務');
    expect([duties?.before, duties?.after]).toEqual(['新規の担当業務', '（なし）']);
  });

  it('変わっていない項目は出さない', () => {
    expect(documentDifferences(doc(added), doc(added))).toEqual([]);
  });
});

describe('版の差分: テーブル・プロフィール・統計・職務経歴', () => {
  it('表はセル1つずつ、列の見出しで示す', () => {
    const table = (cell: string) => ({
      id: 't',
      type: 'table',
      order: 0,
      data: {
        columns: [
          { label: '氏名', align: 'left' },
          { label: '年齢', align: 'right' },
        ],
        rows: [
          ['A', '20'],
          ['B', cell],
        ],
      },
    });
    const [d] = documentDifferences(doc(table('30')), doc(table('31')));
    expect(loc(d)).toBe('テーブル（氏名・年齢） › 2行目 › 年齢');
  });

  it('プロフィールの付随項目は、既知キーを日本語の項目名にする', () => {
    const profile = (age: string) => ({
      id: 'pr',
      type: 'profile',
      order: 0,
      data: { name: '見本', title: '', pr: '', strengths: ['a', 'b'], meta: { age, 好きな物: 'x' } },
    });
    const [d] = documentDifferences(doc(profile('30')), doc(profile('31')));
    expect(loc(d)).toBe('プロフィール › 年齢');
  });

  it('数字カードと職務経歴', () => {
    const stat = (value: string) => ({
      id: 's',
      type: 'stats',
      order: 0,
      data: { items: [{ value, unit: '年', label: '経験', kind: 'free' }] },
    });
    expect(loc(documentDifferences(doc(stat('1')), doc(stat('2')))[0])).toBe('統計 › 経験 › 数値');
    const exp = (endDate: string) => ({
      id: 'e',
      type: 'experience',
      order: 0,
      data: { company: '株式会社C', startDate: '2020-01', endDate, role: 'SE', description: '' },
    });
    const [d] = documentDifferences(doc(exp('')), doc(exp('2021-03')));
    expect(loc(d)).toBe('職務経歴（簡易） › 株式会社C › 終了年月日');
    expect(d.before).toBe('現在');
  });
});

describe('版の差分: 並びが変わっても、別の案件の値を取り違えない', () => {
  const a = project({ id: 'pa', title: '案件A', duties: 'Aの業務' });
  const b = project({ id: 'pb', title: '案件B', duties: 'Bの業務' });
  const c = project({ id: 'pc', title: '案件C', duties: 'Cの業務' });

  it('先頭の案件を消しても、残りの案件は変わらないものとして扱う', () => {
    const result = documentDifferences(doc(projectBlock([a, b])), doc(projectBlock([b])));
    // 案件Aが消えた分だけが出る。案件Bの欄に案件Aの値は出ない。
    expect(result.every((d) => d.location[1] === '案件A')).toBe(true);
    expect(result.find((d) => d.location.at(-1) === '担当業務')).toMatchObject({
      before: 'Aの業務',
      after: '（なし）',
    });
  });

  it('先頭に案件を足しても、既存の案件に差分を出さない', () => {
    const result = documentDifferences(doc(projectBlock([b])), doc(projectBlock([a, b])));
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((d) => d.location[1] === '案件A')).toBe(true);
  });

  it('並べ替えだけの変更も「案件の並び順」として出す', () => {
    const result = documentDifferences(doc(projectBlock([a, b, c])), doc(projectBlock([c, a, b])));
    expect(result).toHaveLength(1);
    expect(loc(result[0])).toBe('案件の並び順');
    expect(result[0].before).toBe('案件A\n案件B\n案件C');
    expect(result[0].after).toBe('案件C\n案件A\n案件B');
  });

  it('ブロックも id で対にする（先頭のブロックを消しても、残りに差分が出ない）', () => {
    const md = (id: string, markdown: string) => ({ id, type: 'markdown', order: 0, data: { markdown } });
    const result = documentDifferences(doc(md('m1', '一つ目'), md('m2', '二つ目')), doc(md('m2', '二つ目')));
    expect(result.map((d) => d.before).filter((t) => t === '二つ目')).toEqual([]);
    expect(result.find((d) => d.location.at(-1) === '本文')?.before).toBe('一つ目');
  });

  it('ブロックの順序だけが違う時も「ブロックの並び順」で出す', () => {
    const md = (id: string, markdown: string) => ({ id, type: 'markdown', order: 0, data: { markdown } });
    const result = documentDifferences(
      doc(md('m1', '一つ目'), md('m2', '二つ目')),
      doc(md('m2', '二つ目'), md('m1', '一つ目')),
    );
    expect(result.map(loc)).toEqual(['ブロックの並び順']);
    expect(result[0].before).toBe('テキスト（一つ目）\nテキスト（二つ目）');
  });
});

describe('版の差分: 「なし → 空」は変更として残す', () => {
  it('既存の案件で未設定から空文字になった差も、差分に出す（内容は同じと言わない）', () => {
    const result = documentDifferences(
      doc(projectBlock([project({ summary: undefined })])),
      doc(projectBlock([project({ summary: '' })])),
    );
    expect(result).toHaveLength(1);
    expect([result[0].before, result[0].after]).toEqual(['（なし）', '（空）']);
  });

  it('追加された案件の中では、空の項目を並べない', () => {
    const result = documentDifferences(
      doc(projectBlock([])),
      doc(projectBlock([project({ acquired: '', comment: '' })])),
    );
    const labels = result.map((d) => d.location.at(-1));
    expect(labels).not.toContain('習得スキル');
    expect(labels).not.toContain('コメント');
    expect(labels).toContain('担当業務');
  });
});
