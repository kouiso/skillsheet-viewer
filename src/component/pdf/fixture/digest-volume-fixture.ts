/**
 * 要約版 PDF のページ数検証用の大量フィクスチャ（19 社・33 案件）。
 *
 * 実データ（/tmp/real-blocks.json）と同じ社数・件数で組む。内容は全部ダミー —
 * ページ割りと品質検査に必要なのは「会社が多い」「案件名が 38 字まで伸びて折り返す」
 * という形だけで、文章の中身は検査対象外。個人情報は一切含めない。
 *
 * プロフィール・統計・スキルのブロックは合成品質フィクスチャのものを流用する
 * （1 ページ目は全文版と同じ SummaryPage なので、同じ入力で検証する）。
 */

import type { Block, CompanyInfo, ProjectItem, ProjectTech } from '@/db/block';

import { buildPdfQualityFixtureBlocks } from './print-quality-fixture';

/** 会社ごとの案件数。合計 33 件（実データと同じ）。 */
const PROJECTS_PER_COMPANY = [3, 2, 1, 1, 2, 1, 3, 1, 2, 1, 1, 2, 3, 1, 2, 1, 2, 1, 3];

/** 案件名の文字数ローテーション。38 字は案件列（約 31 字/行）で必ず折り返す長さ。 */
const TITLE_LENGTHS = [12, 27, 38] as const;

const emptyTech = (): ProjectTech => ({ lang: [], fw: [], db: [], infra: [], tools: [], collab: [] });

/** `len` 文字ちょうどのダミー案件名。先頭に連番を入れて全件ユニークにする。 */
function volumeTitle(seq: number, len: number): string {
  const head = `検証案件${String(seq).padStart(2, '0')}`;
  const pad = 'の設計・実装・運用を担当した';
  let s = head;
  while ([...s].length < len) s += pad;
  return [...s].slice(0, len).join('');
}

export function buildDigestVolumeFixtureBlocks(): Block[] {
  const companies: CompanyInfo[] = [];
  const items: ProjectItem[] = [];

  let seq = 0;
  PROJECTS_PER_COMPANY.forEach((count, companyIndex) => {
    const companyId = `digest-vol-company-${companyIndex}`;
    companies.push({
      id: companyId,
      name: `検証用会社${String(companyIndex + 1).padStart(2, '0')}`,
      kind: '',
      period: '',
      note: '',
    });
    for (let j = 0; j < count; j++) {
      const n = seq++;
      // 期間は 1 年ずつ連続し、最後（seq 33 番目）が 2026.03 で終わる。
      const startYear = 1993 + n;
      items.push({
        id: `digest-vol-project-${n}`,
        companyId,
        title: volumeTitle(n + 1, TITLE_LENGTHS[n % TITLE_LENGTHS.length]),
        scope: '',
        period: `${startYear}.04 — ${startYear + 1}.03`,
        role: '',
        team: `${(n % 9) + 3}名`,
        tech: emptyTech(),
        process: [],
        duties: '',
        acquired: '',
        comment: '',
      });
    }
  });

  // プロフィール・統計・スキルは合成フィクスチャを流用し、案件ブロックだけ差し替える。
  // `Block[]` に明示しないと filter の型述語推論で project 以外の union に狭められ、
  // あとの push が弾かれる。
  const blocks: Block[] = buildPdfQualityFixtureBlocks().filter((b) => b.type !== 'project');
  blocks.push({
    id: 'digest-vol-project-block',
    order: blocks.length,
    type: 'project',
    data: { companies, items },
  });
  return blocks;
}
