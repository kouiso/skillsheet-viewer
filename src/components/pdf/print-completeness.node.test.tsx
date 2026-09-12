/**
 * print-completeness.node.ts の検証。
 *
 * 2 系統のテストを置く。
 *  - 合成データ（下の PROJECT_BLOCKS）でのユニットテスト: 常時走る。hidden/views の除外・
 *    案件スコープでの技術名の突き合わせ・ハイフンを正規化で消さないことを、実データに
 *    依存せず機械的に固定する。
 *  - `REAL_BLOCKS_JSON` + 既存 PDF での実データテスト: 環境変数が無いときは skip する
 *    （`print-document.node.test.tsx` と同じ形）。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Block } from '@/db/blocks';
import { currentMonthKey } from '@/db/derived-display';

import {
  buildCompletenessReport,
  checkCompleteness,
  enumerateCompletenessFacts,
  groupMissingByScope,
  normalizeForMatch,
} from './print-completeness.node';
import type { QualityItem, QualityPage } from './print-quality';
import { extractQualityPages } from './print-quality-extract.node';

function txt(text: string): QualityItem {
  return { text, size: 11, x: 0, y: 0, width: text.length * 6 };
}

// 会社 1 社 ／ 案件 3 件。
//  - アルファ: 8 個の言語を持つが、シミュレートした PDF 側は PRINT_CHIP_LIMIT（6 件）で
//    切り捨てた後の 6 個しか持たない想定（Ruby / PHP が消える）。
//  - ベータ: 見出しは 1 ページ目、本文（コメント）は次のページ（ガンマの見出しと同じ
//    ページ）に溢れる想定。詳細版カードは本文が乗ったまま次の案件の見出しが同じページに
//    始まることがあり（実測: 動画配信サービス案件で発見）、この溢れを拾えているかを見る。
//  - ガンマ: 本文に罠として「PHP」という語をそのまま置く。スコープを効かせずに文書全体を
//    検索すると、アルファの PHP 欠落を「ガンマの本文で見つかった」ことにして見逃して
//    しまう。ガンマはアルファから 2 案件分離れているので、ページ境界の共有（ベータ用の
//    緩和）を入れてもなお、この誤検出は起きないはずというのが後続のテストの主張。
const PROJECT_BLOCKS: Block[] = [
  {
    id: 'b1',
    type: 'project',
    order: 0,
    data: {
      companies: [{ id: 'c1', name: 'テスト社', kind: '', period: '', note: '' }],
      items: [
        {
          id: 'p1',
          companyId: 'c1',
          title: '案件アルファ',
          scope: '',
          period: '2020.01〜2020.06',
          role: 'エンジニア',
          team: '5名',
          tech: {
            lang: ['TypeScript', 'Python', 'Go', 'Rust', 'Kotlin', 'Swift', 'Ruby', 'PHP'],
            fw: [],
            db: [],
            infra: [],
            tools: [],
            collab: [],
          },
          process: [],
          duties: '- 機能Aの実装\n- 機能Bの実装',
          acquired: '',
          comment: '',
        },
        {
          id: 'p2',
          companyId: 'c1',
          title: '案件ベータ',
          scope: '',
          period: '2019.01〜2019.06',
          role: '',
          team: '',
          tech: { lang: ['TypeScript'], fw: [], db: [], infra: [], tools: [], collab: [] },
          process: [],
          duties: '',
          acquired: '',
          comment: '- スコープ境界をまたぐ本文',
        },
        {
          id: 'p3',
          companyId: 'c1',
          title: '案件ガンマ',
          scope: '',
          period: '2018.01〜2018.06',
          role: '',
          team: '',
          tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] },
          process: [],
          duties: '- PHPは使っていない案件',
          acquired: '',
          comment: '',
        },
      ],
    },
  },
];

const SIMULATED_PAGES: QualityPage[] = [
  // page 0 = アルファ（TypeScript〜Swift の 6 個だけが乗る＝切り捨て後）
  [
    txt('テスト社'),
    txt('2018.01〜2020.06'), // 会社の在籍期間（3 案件の period から導出される表示値）
    txt('案件アルファ'),
    txt('2020.01〜2020.06'), // 案件アルファの期間（detail レベルなので periodText そのまま）
    txt('エンジニア'),
    txt('5名'),
    // 技術領域はスタック（Swift→iOS, Kotlin→Android, PHP→バックエンド）からの導出値。
    txt('iOS / Android / バックエンド'),
    txt('機能Aの実装'),
    txt('機能Bの実装'),
    txt('TypeScript'),
    txt('Python'),
    txt('Go'),
    txt('Rust'),
    txt('Kotlin'),
    txt('Swift'),
    txt('他 2 件'),
  ],
  // page 1 = ベータの見出し。本文はまだ乗らない（次ページへ溢れる）。
  [txt('案件ベータ'), txt('2019.01〜2019.06'), txt('TypeScript')],
  // page 2 = ベータの溢れた本文 ＋ ガンマの見出しと罠の本文（同じページに同居する）。
  [txt('スコープ境界をまたぐ本文'), txt('案件ガンマ'), txt('2018.01〜2018.06'), txt('PHPは使っていない案件')],
];

describe('normalizeForMatch', () => {
  it('折り返しのハイフンは消さない（欠落として検出したままにする）', () => {
    expect(normalizeForMatch('アクセス-解析')).toBe('アクセス-解析');
    expect(normalizeForMatch('アクセス-解析')).not.toBe(normalizeForMatch('アクセス解析'));
  });

  it('空白とチルダの異体字は同一視する', () => {
    expect(normalizeForMatch('2020 . 01 〜 2020.06')).toBe(normalizeForMatch('2020.01~2020.06'));
  });
});

describe('enumerateCompletenessFacts', () => {
  it('hidden な案件は事実として列挙しない', () => {
    const hidden = structuredClone(PROJECT_BLOCKS);
    const block = hidden[0];
    if (block.type === 'project') block.data.items[1].hidden = true;
    const facts = enumerateCompletenessFacts(hidden);
    expect(facts.some((f) => f.scope === '案件ベータ')).toBe(false);
    expect(facts.some((f) => f.scope === '案件アルファ')).toBe(true);
  });

  it("views で 'projects' を OFF にすると案件・会社の事実を列挙しない", () => {
    const facts = enumerateCompletenessFacts(PROJECT_BLOCKS, ['skills', 'process', 'timeline']);
    expect(facts.some((f) => f.category === 'project' || f.category === 'company')).toBe(false);
  });

  it('技術名を分類ごと・切り捨て前の件数で列挙する（PRINT_CHIP_LIMIT を無視する）', () => {
    const facts = enumerateCompletenessFacts(PROJECT_BLOCKS);
    const alphaTech = facts.filter((f) => f.scope === '案件アルファ' && f.label.startsWith('技術(言語)'));
    expect(alphaTech).toHaveLength(8); // PRINT_CHIP_LIMIT=6 を超えて Ruby / PHP も含む
  });
});

describe('checkCompleteness（案件スコープでの突き合わせ）', () => {
  it('PRINT_CHIP_LIMIT で切り捨てられた技術名を欠落として検出する', () => {
    const facts = enumerateCompletenessFacts(PROJECT_BLOCKS);
    const report = checkCompleteness(facts, SIMULATED_PAGES);
    const missingLabels = report.missing.filter((m) => m.fact.scope === '案件アルファ').map((m) => m.fact.label);
    expect(missingLabels).toEqual(expect.arrayContaining(['技術(言語): Ruby', '技術(言語): PHP']));
  });

  it('2 案件離れた本文に同じ語があっても、スコープを外した誤検出（見つかったことにする）はしない', () => {
    // 罠が効いていることの前提確認: 「PHP」という文字列自体は文書のどこかに実在する
    // （ガンマの本文。アルファから 2 案件離れている）。
    const flatText = SIMULATED_PAGES.flatMap((page) => page.map((item) => item.text)).join('');
    expect(flatText).toContain('PHP');

    const facts = enumerateCompletenessFacts(PROJECT_BLOCKS);
    const report = checkCompleteness(facts, SIMULATED_PAGES);
    const alphaPhp = report.missing.filter(
      (m) => m.fact.scope === '案件アルファ' && m.fact.label === '技術(言語): PHP',
    );
    expect(alphaPhp).toHaveLength(1);
  });

  it('前の案件の本文が次の案件の見出しと同じページに溢れても、その本文を見つける', () => {
    // ベータの見出しは page 1、コメント本文は page 2（＝ガンマの見出しと同じページ）に
    // 溢れている想定。ページ範囲を「次の案件名が現れる直前のページ」までで区切ると、
    // この本文は範囲の外に落ちて誤って missing になる（実測: 動画配信サービス案件で発見
    // した回帰そのもの）。境界ページを両案件で共有することで正しく見つかる。
    const facts = enumerateCompletenessFacts(PROJECT_BLOCKS);
    const report = checkCompleteness(facts, SIMULATED_PAGES);
    const spilled = report.missing.filter((m) => m.fact.scope === '案件ベータ' && m.fact.label === 'コメント 1行目');
    expect(spilled).toEqual([]);
  });

  it('メタ表・チーム規模・案件名など、実際にページ内にある事実は見つかる', () => {
    const facts = enumerateCompletenessFacts(PROJECT_BLOCKS);
    const report = checkCompleteness(facts, SIMULATED_PAGES);
    const missingNonTech = report.missing.filter((m) => !m.fact.label.startsWith('技術('));
    expect(missingNonTech).toEqual([]);
  });
});

// --- 見出しの地の文言及を開始ページと誤認しない（実測バグの回帰） -------------------------
//
// team-lead 報告のバグ: 会社概要が「業務委託にて、A、B を担当。」のように後続案件名を
// 地の文で並べて言及すると、旧実装は「案件名の文字列が最初に現れたページ」をそのまま
// 開始ページにしていたため、地の文のページ（本物のカードより前）を開始ページと誤認して
// いた。しかも 2 案件が同じ文の中で並んで言及されるため、両方の開始ページが同じ地の文の
// ページに揃ってしまい、「次の案件の開始ページまで」で区切る終了ページの計算まで巻き込んで
// 範囲が地の文のページ 1 枚だけに潰れ、本物のカードが乗った次のページが丸ごと範囲の外に
// 出て missing になっていた（実測: E社の概要が言及した直後の案件「3D メディア販売向けの
// ポートフォリオサイトの構築」で 21 個の事実が missing 化）。
//
// 案件イプシロン・ゼータの 2 件を、この形をそのまま再現する最小構成にする。
const PROSE_MENTION_BLOCKS: Block[] = [
  {
    id: 'b2',
    type: 'project',
    order: 0,
    data: {
      companies: [
        {
          id: 'c2',
          name: 'プローズ社',
          kind: '',
          period: '',
          note: '業務委託にて、案件イプシロンと案件ゼータを担当。',
        },
      ],
      items: [
        {
          id: 'p4',
          companyId: 'c2',
          title: '案件イプシロン',
          scope: '',
          period: '2021.01〜2021.06',
          role: 'PM',
          team: '3名',
          tech: { lang: ['TypeScript'], fw: [], db: [], infra: [], tools: [], collab: [] },
          process: [],
          duties: '- 要件定義',
          acquired: '',
          comment: '',
        },
        {
          id: 'p5',
          companyId: 'c2',
          title: '案件ゼータ',
          scope: '',
          period: '2022.01〜2022.06',
          role: 'PM',
          team: '4名',
          tech: { lang: ['Go'], fw: [], db: [], infra: [], tools: [], collab: [] },
          process: [],
          duties: '- 運用',
          acquired: '',
          comment: '',
        },
      ],
    },
  },
];

// page 0 = 会社概要（地の文で両案件名に言及するページ）。実測の pdfjs 抽出と同じ形にする
// ため、案件名を含む文全体を 1 個の item にする（item 境界が案件名の前後で切れない ＝
// 「見出しとしてのきれいな境界」を持たない）。
// page 1 / page 2 = それぞれの本物のカード（案件名だけが単独の item ＝見出し）。
const PROSE_MENTION_PAGES: QualityPage[] = [
  [txt('プローズ社'), txt('業務委託にて、案件イプシロンと案件ゼータを担当。')],
  [txt('案件イプシロン'), txt('2021.01〜2021.06'), txt('PM'), txt('3名'), txt('TypeScript'), txt('要件定義')],
  [txt('案件ゼータ'), txt('2022.01〜2022.06'), txt('PM'), txt('4名'), txt('Go'), txt('運用')],
];

describe('見出しの地の文言及を開始ページと誤認しない', () => {
  it('会社概要が後続案件名を地の文で言及していても、本物のカードのページで事実を見つける', () => {
    const facts = enumerateCompletenessFacts(PROSE_MENTION_BLOCKS);
    const report = checkCompleteness(facts, PROSE_MENTION_PAGES);
    const epsilonMissing = report.missing.filter((m) => m.fact.scope === '案件イプシロン');
    const zetaMissing = report.missing.filter((m) => m.fact.scope === '案件ゼータ');
    expect(epsilonMissing).toEqual([]);
    expect(zetaMissing).toEqual([]);
  });

  it('本物のカードから事実を 1 個削ったら、今も missing として検出する（検出力が弱まっていないことの確認）', () => {
    // 「見出しは地の文と違う」という判定を厳しくしただけで、本物の欠落まで見逃すように
    // なっていないかを確認する。案件イプシロンの「期間」だけをページから消す
    // （この文字列は他のどのページにも出てこない）。
    const facts = enumerateCompletenessFacts(PROSE_MENTION_BLOCKS);
    const brokenPages = PROSE_MENTION_PAGES.map((page, i) =>
      i === 1 ? page.filter((item) => item.text !== '2021.01〜2021.06') : page,
    );
    const report = checkCompleteness(facts, brokenPages);
    const periodMissing = report.missing.filter((m) => m.fact.scope === '案件イプシロン' && m.fact.label === '期間');
    expect(periodMissing).toHaveLength(1);
    // 巻き添えで別の案件まで missing 扱いになっていないことも確認する。
    const zetaMissing = report.missing.filter((m) => m.fact.scope === '案件ゼータ');
    expect(zetaMissing).toEqual([]);
  });
});

describe('派生統計と固定生成月', () => {
  it('保存値でなく表示案件数と固定月の経験月数を検査する', () => {
    const project = structuredClone(PROJECT_BLOCKS[0]) as Extract<Block, { type: 'project' }>;
    project.data.items = [{ ...project.data.items[0], period: '2025.01〜現在' }];
    const blocks: Block[] = [
      project,
      {
        id: 'synthetic-stats',
        type: 'stats',
        order: 1,
        data: {
          items: [
            { value: '99+', unit: '件', label: '参画プロジェクト数' },
            { value: '99', unit: 'ヶ月', label: '実務経験' },
          ],
        },
      },
    ];
    const values = (month: number) =>
      enumerateCompletenessFacts(blocks, ['skills'], month)
        .filter((f) => f.category === 'stats' && f.label.endsWith('の値'))
        .map((f) => f.text);
    expect(values(2025 * 12 + 2)).toEqual(['1', '3']);
    expect(values(2025 * 12 + 4)).toEqual(['1', '5']);
    expect(
      buildCompletenessReport(blocks, [[txt('1件参画プロジェクト数3ヶ月実務経験')]], ['skills'], 2025 * 12 + 2).missing,
    ).toEqual([]);
  });
});

describe('絶対配置の継続ヘッダー帯', () => {
  it('省略記号になった継続ヘッダーを除き、本文上端800ptの文字は残す', () => {
    const facts = [
      { category: 'project' as const, scope: '架空案件', label: '案件名', text: '架空案件' },
      { category: 'project' as const, scope: '架空案件', label: '本文', text: '前半後半' },
    ];
    const pages = [
      [
        { ...txt('架空案件'), y: 780 },
        { ...txt('前半'), y: 100 },
      ],
      [
        { ...txt('とても長い継続見出し…'), y: 812 },
        { ...txt('後半'), y: 800 },
      ],
    ];
    expect(checkCompleteness(facts, pages).missing).toEqual([]);
    pages[1][1].y = 800.01;
    expect(checkCompleteness(facts, pages).missing).toHaveLength(1);
  });
});

describe('番号付き見出しと案件境界', () => {
  it('番号と案件名の先頭が同じitemでも、会社概要ではなく実見出しから探す', () => {
    const facts = [
      { category: 'project' as const, scope: '架空案件A', label: '案件名', text: '架空案件A' },
      { category: 'project' as const, scope: '架空案件A', label: '本文', text: 'Aの続き本文' },
      { category: 'project' as const, scope: '架空案件B', label: '案件名', text: '架空案件B' },
    ];
    const pages = [
      [txt('概要で架空案件Aと架空案件Bを紹介する。')],
      [txt('11. 架空'), txt('案件A')],
      [txt('Aの続き本文'), txt('12. 架空'), txt('案件B')],
    ];
    expect(checkCompleteness(facts, pages).missing).toEqual([]);
  });

  it('同名案件をIDで分離し、片方にしかない本文を他方で見つかったことにしない', () => {
    const facts = ['first', 'second'].flatMap((scopeId) => [
      { category: 'project' as const, scope: '同名案件', scopeId, label: '案件名', text: '同名案件' },
      { category: 'project' as const, scope: '同名案件', scopeId, label: '本文', text: '共通本文' },
    ]);
    const report = checkCompleteness(facts, [[txt('1. 同名案件'), txt('2. 同名案件'), txt('共通本文')]]);
    expect(report.missing).toHaveLength(1);
    expect(report.missing[0].fact.scopeId).toBe('first');
  });

  it('案件名が全くなければ他案件の同文で本文欠落を埋め合わせない', () => {
    const facts = [
      { category: 'project' as const, scope: '未描画案件', label: '案件名', text: '未描画案件' },
      { category: 'project' as const, scope: '未描画案件', label: '本文', text: '共通本文' },
    ];
    expect(checkCompleteness(facts, [[txt('別案件'), txt('共通本文')]]).missing).toHaveLength(2);
  });

  it('簡約表の期間列を含め、次案件の期間を前案件に流用しない', () => {
    const facts = ['先行案件', '後続案件'].flatMap((scope) => [
      { category: 'project' as const, scope, label: '案件名', text: scope, headingPrefix: '2024.04–07' },
      { category: 'project' as const, scope, label: '期間', text: '2024.04–07' },
    ]);
    const pages = [[txt('11. 先行案件'), txt('2024.04–07'), txt('12. 後続案件')]];
    const report = checkCompleteness(facts, pages);
    expect(report.missing).toHaveLength(1);
    expect(report.missing[0].fact.scope).toBe('先行案件');
  });

  it('同じページの隣接案件にある本文を欠落の埋め合わせに使わない', () => {
    const facts = [
      { category: 'project' as const, scope: '架空案件A', label: '案件名', text: '架空案件A' },
      { category: 'project' as const, scope: '架空案件A', label: '本文', text: '共通本文' },
      { category: 'project' as const, scope: '架空案件B', label: '案件名', text: '架空案件B' },
    ];
    expect(checkCompleteness(facts, [[txt('架空案件A'), txt('架空案件B'), txt('共通本文')]]).missing).toHaveLength(1);
  });
});

// --- 実データ + 既存 PDF ---------------------------------------------------------
//
// `REAL_BLOCKS_JSON` に blocks テーブルの JSON を、`COMPLETENESS_PDF_PATH` に検証対象の
// PDF パスを渡したときだけ走る（未指定なら既定で .evidence/pdf-print-redesign/
// skillsheet-new-design.pdf を見る）。現状の PDF は PRINT_CHIP_LIMIT による技術名の
// 切り捨てを含むため、このテストは今は red のまま — それ自体が「まだ直っていない事実の
// 一覧」を機械的に出す役目を果たす。
const REAL_BLOCKS_JSON = process.env.REAL_BLOCKS_JSON;
const monthInput = process.env.PRINT_REFERENCE_MONTH;
if (monthInput !== undefined && (!/^\d+$/.test(monthInput) || !Number.isSafeInteger(Number(monthInput)))) {
  throw new Error('PRINT_REFERENCE_MONTH は年*12+月(0始まり)の整数で指定してください');
}
const referenceMonth = monthInput === undefined ? currentMonthKey() : Number(monthInput);
const REPO_ROOT = path.resolve(process.cwd(), '../..');
const DEFAULT_PDF_PATH = path.join(REPO_ROOT, '.evidence/pdf-print-redesign/skillsheet-new-design.pdf');
const PDF_PATH = process.env.COMPLETENESS_PDF_PATH ?? DEFAULT_PDF_PATH;

describe('全件全文ゲート（実データ + 既存 PDF）', () => {
  it.skipIf(!REAL_BLOCKS_JSON || !existsSync(PDF_PATH))(
    '元データの事実が印刷結果のどこかに全部載っている',
    async () => {
      const blocks = JSON.parse(readFileSync(REAL_BLOCKS_JSON as string, 'utf-8')) as Block[];
      const pdfBuffer = readFileSync(PDF_PATH);
      const pages = await extractQualityPages(pdfBuffer);
      const report = buildCompletenessReport(blocks, pages, undefined, referenceMonth);
      const grouped = groupMissingByScope(report.missing);
      const techMissing = report.missing.filter((m) => m.fact.label.startsWith('技術('));

      console.log(
        `[completeness] facts=${report.totalFacts} found=${report.totalFound} missing=${report.missing.length}` +
          ` (うち技術名=${techMissing.length}) scopes=${grouped.size}`,
      );
      for (const [scope, findings] of grouped) {
        console.log(`[completeness] --- ${scope} (${findings.length}) ---`);
        for (const f of findings.slice(0, 20)) {
          console.log(`[completeness]   ${f.fact.label}: ${f.fact.text.slice(0, 30)}`);
        }
      }

      expect(report.missing).toEqual([]);
    },
    300_000,
  );
});
describe('元ブロック由来のスキルと強みの完全性', () => {
  const blocks: Block[] = [
    { id: 'profile', type: 'profile', order: 0, data: { name: '', strengths: ['障害分析を主導'] } } as Block,
    {
      id: 'skills',
      type: 'skills',
      order: 1,
      data: { category: '言語', skills: [{ name: '独自言語', years: 2.5, level: '上級' }] },
    } as Block,
  ];
  it('一覧の経験ラベルと主力スタックと強みをそれぞれ列挙する', () => {
    const facts = enumerateCompletenessFacts(blocks, ['skills']);
    expect(facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'スキル: 独自言語', text: '独自言語（2.5年）' }),
        expect.objectContaining({ label: '主力スタック: 独自言語', text: '独自言語 2.5年' }),
        expect.objectContaining({ label: '強み 1', text: '障害分析を主導' }),
      ]),
    );
  });
  it.each(['スキル: 独自言語', '主力スタック: 独自言語', '強み 1'])('%sを削ると欠落になる', (label) => {
    const facts = enumerateCompletenessFacts(blocks, ['skills']);
    const item = (text: string, size = 11) => ({ ...txt(text), x: 40, y: 600, size });
    const remaining = facts.filter((f) => f.label !== label);
    const pages = [
      [
        item('主力スタック'),
        ...remaining.filter((f) => f.region === 'topSkills').map((f) => item(f.text)),
        item('得意分野'),
        ...remaining.filter((f) => f.region === 'strengths').map((f) => item(f.text)),
        item('自己紹介'),
      ],
      [item('スキル一覧', 15), ...remaining.filter((f) => f.region === 'skills').map((f) => item(f.text))],
    ];
    expect(checkCompleteness(facts, pages).missing.map((f) => f.fact.label)).toContain(label);
  });
  it('同じGitが一覧だけにあっても主力スタックの欠落を検出する', () => {
    const source = [
      { id: 's', type: 'skills', order: 0, data: { category: 'ツール', skills: [{ name: 'Git', years: 0 }] } },
    ] as Block[];
    const facts = enumerateCompletenessFacts(source, ['skills']);
    const pages = [
      [
        { ...txt('スキル一覧'), x: 40, y: 700, size: 15 },
        { ...txt('ツール'), y: 650 },
        { ...txt('Git'), y: 650 },
      ],
    ];
    expect(checkCompleteness(facts, pages).missing.map((f) => f.fact.label)).toEqual(['主力スタック: Git']);
  });
  it('継続中案件の経験は同じ固定月で列挙し手入力へ戻さない', () => {
    const project = structuredClone(PROJECT_BLOCKS[0]) as Extract<Block, { type: 'project' }>;
    project.data.items = [
      {
        ...project.data.items[0],
        period: '2026.07〜現在',
        tech: {
          lang: ['独自言語'],
          fw: [],
          db: [],
          infra: [],
          tools: [],
          collab: [],
        },
      },
    ];
    const facts = enumerateCompletenessFacts([...blocks, project], ['skills'], 24320);
    expect(facts.find((f) => f.label === 'スキル: 独自言語')?.text).toBe('独自言語（0 年 3 ヶ月）');
    expect(facts.find((f) => f.label === '主力スタック: 独自言語')?.text).toBe('独自言語 0 年 3 ヶ月');
  });
  it('主力スタックは推し優先で10件だがスキル一覧は全件を検査する', () => {
    const source: Block[] = [
      {
        id: 's',
        type: 'skills',
        order: 0,
        data: {
          category: 'ツール',
          skills: Array.from({ length: 11 }, (_, index) => ({
            name: `技能${index}`,
            years: 11 - index,
            featured: index === 10,
          })),
        },
      } as Block,
    ];
    const facts = enumerateCompletenessFacts(source, ['skills']);
    const top = facts.filter((f) => f.label.startsWith('主力スタック:'));
    expect(top).toHaveLength(10);
    expect(top[0].text).toBe('技能10');
    expect(facts.filter((f) => f.label.startsWith('スキル:'))).toHaveLength(11);
    expect(facts.filter((f) => f.label.startsWith('スキル:')).every((f) => !f.text.includes('年'))).toBe(true);
  });
  it('skillsがOFFなら一覧と主力スタックを除外し強みを残す', () => {
    const facts = enumerateCompletenessFacts(blocks, []);
    expect(facts.some((f) => f.label.startsWith('スキル:') || f.label.startsWith('主力スタック:'))).toBe(false);
    expect(facts.some((f) => f.label === '強み 1')).toBe(true);
  });
});
