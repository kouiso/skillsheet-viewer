// 公開定期 CI 専用。全て架空の文章をここで生成し、外部データ・環境変数を入力にしない。
// DB / dotenv / network の import や、既存ファイルの読み込みを追加しない。
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const company = (id, name, hidden = false) => ({ id, name, hidden, kind: '架空事業', period: '', note: '' });
const paragraph = Array.from(
  { length: 72 },
  (_, i) =>
    `第${String(i + 1).padStart(2, '0')}観測では架空の星図を日本語で記録し、位置と色の対応を確かめた。読み手が追跡できるよう、観測の順序と確認内容を一つの段落へ残した。`,
).join('');
const project = (id, companyId, title, period, overrides = {}) => ({
  id,
  companyId,
  title,
  period,
  scope: '架空の観測装置',
  role: '検証担当',
  team: '3名',
  tech: {
    lang: ['TypeScript'],
    fw: ['架空星図表示ライブラリ'],
    db: ['PostgreSQL'],
    infra: [],
    tools: ['SyntheticObservatoryTelemetryVisualizationToolkit'],
    collab: [],
  },
  process: ['設計', '実装', 'テスト'],
  duties: '架空の観測記録を入力し、星の名前と色を表示する機能を検証した。',
  acquired: '日本語と英字が混在する説明を、意味のまとまりを保って配置した。',
  comment: 'この文章と会社・案件はすべて自動検証のために作った架空の情報です。',
  ...overrides,
});
const blocks = [
  {
    id: 'synthetic-profile',
    type: 'profile',
    order: 0,
    data: {
      name: '架空 太郎',
      title: '合成レイアウト検証',
      company: '架空星図研究所',
      pr: 'これは公開回帰テスト専用の完全な架空データです。実在する人物の経歴は含みません。',
      strengths: ['日本語の文章配置', '改ページの確認'],
      meta: { work: '架空の勤務形態' },
    },
  },
  {
    id: 'synthetic-skills',
    type: 'skills',
    order: 1,
    data: {
      category: '架空検証用スキル',
      skills: [
        { name: 'TypeScript', years: 1, level: '検証用' },
        { name: 'SyntheticObservatoryTelemetryVisualizationToolkit', years: 1, level: '検証用' },
        { name: '日本語星図表示ライブラリ', years: 1, level: '検証用' },
      ],
    },
  },
  {
    id: 'synthetic-projects',
    type: 'project',
    order: 2,
    data: {
      companies: [
        company('synthetic-company-a', '架空星図研究所'),
        company('synthetic-company-b', '架空雲観測工房'),
        company('synthetic-company-hidden', '非表示会社検証用', true),
      ],
      items: [
        project('synthetic-long', 'synthetic-company-a', '架空星図の長段落配置検証', '2026.01 - 2026.06', {
          duties: paragraph,
          acquired:
            '- 架空の星図を日本語で表示した。\n- TypeScript の入力型を確認した。\n- 改ページ後も本文が欠落しないことを確認した。',
        }),
        project('synthetic-short', 'synthetic-company-a', '架空星図の短い説明検証', '2025.07 - 2025.12'),
        project('synthetic-older', 'synthetic-company-b', '架空雲の記録帳検証', '2021.01 - 2021.06'),
        project('synthetic-hidden-project', 'synthetic-company-a', '非表示案件検証用', '2025.01 - 2025.06', {
          hidden: true,
        }),
        project(
          'synthetic-hidden-company-project',
          'synthetic-company-hidden',
          '非表示会社配下案件検証用',
          '2024.01 - 2024.06',
        ),
      ],
    },
  },
];
const [out, evidence, variant, ...extra] = process.argv.slice(2);
// 少数スキルの合法ケースは負例として残す。既存の専用ページが疎になる問題を隠さない。
const sparse = variant === '--sparse-skills';
if (!sparse) {
  const skills = Array.from({ length: 12 }, (_, index) => ({
    id: `synthetic-skills-${index}`,
    type: 'skills',
    order: index + 1,
    data: {
      category: `架空分類${index + 1}`,
      skills: (index === 0
        ? ['SyntheticObservatoryTelemetryVisualizationToolkit']
        : [`架空言語${index}`, `架空表示${index}`, `架空検証${index}`]
      ).map((name) => ({ name, years: 1, level: '検証用' })),
    },
  }));
  blocks.splice(1, 1, ...skills);
  blocks[blocks.length - 1].order = blocks.length - 1;
}
// このアプリが日付入力から生成する期間区切り。ASCII hyphen は年月内の区切りと衝突する。
for (const item of blocks[blocks.length - 1].data.items) item.period = item.period.replace(' - ', '〜');
if (!out || !evidence || extra.length || (variant && !sparse) || out === evidence) {
  console.error('Synthetic fixture generation requires two distinct output paths.');
  process.exitCode = 1;
} else {
  try {
    const json = `${JSON.stringify(blocks, null, 2)}\n`;
    const sha256 = createHash('sha256').update(json).digest('hex');
    const projectData = blocks.filter((block) => block.type === 'project').map((block) => block.data);
    const counts = projectData.reduce(
      (sum, data) => {
        const hiddenCompanies = new Set(
          data.companies.filter((company) => company.hidden).map((company) => company.id),
        );
        return {
          companies: sum.companies + data.companies.length,
          projects: sum.projects + data.items.length,
          visibleCompanies: sum.visibleCompanies + data.companies.filter((company) => !company.hidden).length,
          visibleProjects:
            sum.visibleProjects +
            data.items.filter((item) => !item.hidden && !hiddenCompanies.has(item.companyId)).length,
        };
      },
      { companies: 0, projects: 0, visibleCompanies: 0, visibleProjects: 0 },
    );
    // wx は既存ファイルや symlink の上書きを拒否する。再実行時は cleanup 後の TEMP を使う。
    writeFileSync(out, json, { mode: 0o600, flag: 'wx' });
    writeFileSync(
      evidence,
      `PDF_SYNTHETIC_FIXTURE source=synthetic sha256=${sha256} blocks=${blocks.length} companies=${counts.companies} projects=${counts.projects} visibleCompanies=${counts.visibleCompanies} visibleProjects=${counts.visibleProjects}\n`,
      { mode: 0o600, flag: 'wx' },
    );
  } catch {
    // パスや例外本文を公開ログへ出さない。workflow は終了状態だけを記録する。
    console.error('Synthetic fixture generation failed.');
    process.exitCode = 1;
  }
}
