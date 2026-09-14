// node 環境（vitest.config.pdf.ts 側）で実行する。exceljs は jsdom 前提の画面テストから
// 除外されるため `*.node.test.tsx` 命名に合わせる。
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import type { Block, ProjectItem } from '@/db/blocks';

import { buildSkillSheetXlsx } from './build-xlsx';

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

const projectBlock = (items: ProjectItem[], companies: { id: string; name: string; hidden?: boolean }[]): Block => ({
  id: 'b-project',
  type: 'project',
  order: 1,
  data: {
    companies: companies.map((c) => ({ kind: '', period: '', note: '', ...c })),
    items,
  },
});

const reload = async (buf: Uint8Array) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  return wb;
};

describe('buildSkillSheetXlsx', () => {
  it('プロフィールを D1:D7 / AU1:AU4 に書き、案件を開始月の新しい順に並べる', async () => {
    const newest = item({
      id: 'i-new',
      title: '新しい案件',
      period: '2026.8 — 現在',
      ongoing: true,
      process: ['実装', '運用・保守'],
      duties: '- やったこと\n**太字**の文',
      acquired: '- 学んだこと',
      comment: '# 見出し\n普通の文',
      role: 'フロントエンドエンジニア',
      team: '13 名',
      tech: tech({
        lang: ['TypeScript'],
        infra: ['AWS ECS'],
        fw: ['Next.js'],
        tools: ['Vitest'],
        collab: ['Slack'],
      }),
    });
    const older = item({
      id: 'i-old',
      title: '古い案件',
      period: '2024.1 — 2024.12',
      process: ['要件定義', '結合テスト'],
    });
    // 入力順をあえて古い順にして、出力が開始月降順になることを見る
    const buf = await buildSkillSheetXlsx([profileBlock, projectBlock([older, newest], [{ id: 'c1', name: 'C社' }])]);
    const ws = (await reload(buf)).worksheets[0];

    expect(ws.name).toMatch(/^latest-\d{4}-\d{2}$/);

    // プロフィール（D列=値、AU列=付随情報）
    expect(ws.getCell('D1').value).toBe('山田 太郎');
    expect(ws.getCell('D2').value).toBe('30歳');
    expect(ws.getCell('D3').value).toBe('基本情報技術者');
    expect(ws.getCell('D4').value).toBe('フルリモート');
    expect(ws.getCell('D5').value).toBe('React, TypeScript');
    expect(ws.getCell('D6').value).toBe('Web 開発');
    expect(ws.getCell('D7').value).toBe('自己PRの本文');
    expect(ws.getCell('AU1').value).toBe('株式会社サンプル');
    expect(ws.getCell('AU2').value).toBe('男');
    expect(ws.getCell('AU3').value).toBe('高卒');
    expect(ws.getCell('AU4').value).toBe('東京');

    // 新しい案件が 1 行目（行10〜12）に来る
    expect(ws.getCell('A10').value).toBe(1);
    expect(ws.getCell('J10').value).toBe('新しい案件');
    const start = ws.getCell('B10').value;
    expect(start).toBeInstanceOf(Date);
    expect((start as Date).getUTCFullYear()).toBe(2026);
    expect((start as Date).getUTCMonth()).toBe(7);
    expect(ws.getCell('E10').value).toBe('-');
    expect(ws.getCell('G10').value).toBe('現在');
    // 進行中の月数は TODAY() 参照の数式
    expect(ws.getCell('B12').value).toEqual({ formula: 'DATEDIF(B10,TODAY(),"M")+1' });

    // 業務内容セル: ≪≫ 3 段、'- '→'・'、'**' 除去、'#' 除去
    const desc = ws.getCell('J11').value;
    expect(desc).toBe(
      '≪担当業務≫\n・やったこと\n太字の文\n\n≪習得スキル≫\n・学んだこと\n\n≪コメント≫\n見出し\n普通の文',
    );

    // 役割/規模（'13 名' → '13人'）
    expect(ws.getCell('AQ11').value).toBe('役割\nフロントエンドエンジニア\n\n\n全体\n13人');

    // 技術列（fw+tools は同じ FW・MW ツール等セルに改行連結、空は '-'）
    expect(ws.getCell('AT10').value).toBe('TypeScript');
    expect(ws.getCell('AW10').value).toBe('-');
    expect(ws.getCell('BC10').value).toBe('AWS ECS');
    expect(ws.getCell('BG10').value).toBe('Next.js\nVitest');
    expect(ws.getCell('BL10').value).toBe('Slack');

    // ●: '実装'→実装・単体列(BU=73)、'運用・保守'→保守・運用列(BX=76)
    expect(ws.getCell('BU10').value).toBe('●');
    expect(ws.getCell('BX10').value).toBe('●');
    expect(ws.getCell('BR10').value).toBeNull();
    expect(ws.getCell('BS10').value).toBeNull();
    expect(ws.getCell('BT10').value).toBeNull();
    expect(ws.getCell('BV10').value).toBeNull();
    expect(ws.getCell('BW10').value).toBeNull();

    // 2 件目（終了済み）は行13〜15。終了セルは月末日、月数は B-G 参照の数式
    expect(ws.getCell('A13').value).toBe(2);
    expect(ws.getCell('J13').value).toBe('古い案件');
    const end = ws.getCell('G13').value;
    expect(end).toBeInstanceOf(Date);
    expect((end as Date).getUTCDate()).toBe(31);
    expect((end as Date).getUTCMonth()).toBe(11);
    expect(ws.getCell('B15').value).toEqual({ formula: 'DATEDIF(B13,G13,"M")+1' });
    expect(ws.getCell('BR13').value).toBe('●'); // 要件定義
    expect(ws.getCell('BV13').value).toBe('●'); // 結合テスト
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
    const buf = await buildSkillSheetXlsx([
      profileBlock,
      projectBlock(
        [visible, hiddenItem, underHiddenCompany],
        [
          { id: 'c1', name: 'C社' },
          { id: 'c-hidden', name: '隠し会社', hidden: true },
        ],
      ),
    ]);
    const ws = (await reload(buf)).worksheets[0];

    expect(ws.getCell('J10').value).toBe('表示案件');
    // 表示 1 件だけなので行13 以降に案件は出ない
    expect(ws.getCell('J13').value).toBeNull();
    expect(ws.getCell('A13').value).toBeNull();
  });

  it('期間を解釈できない案件は日付セルを素の文字列入力に倒し、ブロック自体は残す', async () => {
    const odd = item({ id: 'i-odd', title: '期間不明の案件', period: '不定期' });
    const buf = await buildSkillSheetXlsx([projectBlock([odd], [{ id: 'c1', name: 'C社' }])]);
    const ws = (await reload(buf)).worksheets[0];

    expect(ws.getCell('J10').value).toBe('期間不明の案件');
    expect(ws.getCell('B10').value).toBe('不定期');
    expect(ws.getCell('B12').value).toBeNull();
  });

  it("終了月のない期間（'2024.1'）は終了セル・月数セルを空にし Invalid Date を書かない", async () => {
    const noEnd = item({ id: 'i-noend', title: '終了月なしの案件', period: '2024.1' });
    const buf = await buildSkillSheetXlsx([projectBlock([noEnd], [{ id: 'c1', name: 'C社' }])]);
    const ws = (await reload(buf)).worksheets[0];

    const start = ws.getCell('B10').value;
    expect(start).toBeInstanceOf(Date);
    expect(ws.getCell('G10').value).toBeNull();
    expect(ws.getCell('B12').value).toBeNull();
  });

  it('1 案件 = 3 行で、結合セル・行高を持ち、説明行は内容量に応じて高くなる', async () => {
    const long = item({
      id: 'i-long',
      title: '長文案件',
      period: '2026.8 — 現在',
      duties: 'あ'.repeat(400),
    });
    const buf = await buildSkillSheetXlsx([projectBlock([long], [{ id: 'c1', name: 'C社' }])]);
    const wb = await reload(buf);
    const ws = wb.worksheets[0];

    // ブロック内結合（タイトル J10:AP10 / 業務内容 J11:AP12 / No. A10:A12）
    const merges = new Set(
      Object.values(
        (
          ws as unknown as {
            _merges: Record<string, { model: { top: number; left: number; bottom: number; right: number } }>;
          }
        )._merges,
      ).map((m) => `${m.model.top}:${m.model.left}-${m.model.bottom}:${m.model.right}`),
    );
    expect(merges.has('10:1-12:1')).toBe(true);
    expect(merges.has('10:10-10:42')).toBe(true);
    expect(merges.has('11:10-12:42')).toBe(true);

    expect(ws.getRow(12).height).toBeGreaterThanOrEqual(120);
    // 19.5 以外（内容量に応じて引き伸ばされている）
    expect(ws.getRow(12).height).toBeGreaterThan(19.5);
  });

  it('ブロック間に区切り線を引き、表の最下端は中線で閉じる（旧スプシの罫線構成）', async () => {
    const a = item({ id: 'i-a', title: 'A案件', period: '2026.8 — 現在' });
    const b = item({ id: 'i-b', title: 'B案件', period: '2025.1 — 2025.12' });
    const buf = await buildSkillSheetXlsx([projectBlock([a, b], [{ id: 'c1', name: 'C社' }])]);
    const ws = (await reload(buf)).worksheets[0];

    // ブロック1の最終行（r12）下端: タイトル幅の J:AP にも細線が通る
    expect(ws.getCell(12, 10).border?.bottom?.style).toBe('thin');
    // ブロック2以降はドナー（原本ブロック22 = r73-75）の書式を無改変で複写:
    // 先頭行 AQ:AS の上端は区切り線と同色の緑細線、G:I（期間終了）の上端は黒細線
    for (const c of [43, 44, 45]) {
      expect(ws.getCell(13, c).border?.top?.style).toBe('thin');
      expect(ws.getCell(13, c).border?.top?.color?.argb).toBe('FF003300');
    }
    for (const c of [7, 8, 9]) {
      expect(ws.getCell(13, c).border?.top?.style).toBe('thin');
      expect(ws.getCell(13, c).border?.top?.color?.argb).toBe('FF000000');
    }
    // 期間内側の仕切り hair は、ブロック2以降では黒ではなく濃緑
    expect(ws.getCell(13, 9).border?.right?.color?.argb).toBe('FF003300');
    // 最終ブロック（r13-15）の下端は表の外枠（中線・黒）
    expect(ws.getCell(15, 10).border?.bottom?.style).toBe('medium');
  });
});
