import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { createSheet, deleteSheet, listSheets } from '@/db';
import type { BlockInput, ProfileBlockData } from '@/db/blocks';
import {
  buildRealVolumeDemoBlocks,
  COMPANY_NAMES,
  createRealVolumeDemoSheet,
  REAL_VOLUME_COMPANY_COUNT,
  REAL_VOLUME_FLAGSHIP_PROJECT_TITLE,
  TECH_POOLS,
} from '@/db/fixtures';
import { extractPdfPages, extractPdfText } from './pdf-extract';

// PR #298（提出用 PDF をデザイン準拠の構造描画へ作り替える）のユーザーストーリーを、
// 「動いた」ではなく「壊れる条件」から書いたアサーションとして固定する。
// skill `adversarial-tester-mindset` の要求どおり、各 test に「red にした変異」を
// コメントで残す（次の人がそのまま再証明できるように）。
//
// 動画は撮らない。ここに書いた Playwright テストの実行自体から `video: 'on'` で
// 副産物として残す（テストと動画が同じ台本から出るので、動画が古くなることが
// 構造的に起きない）。

// このファイルはビューア（閲覧コード）の経路しか使わない。プロジェクト既定の
// storageState はビルダー（Better Auth）用なので、adversarial.spec.ts の
// ビューア系テストが browser.newContext() で毎回真っさらなコンテキストを
// 作っているのと同じ意図で、ここではファイル単位で空の storageState に上書きする。
test.use({ video: 'on', storageState: { cookies: [], origins: [] } });

const viewerCode = process.env.VIEWER_CODE ?? 'viewer-code-local';
const baseURL = process.env.PLAYWRIGHT_BASEURL ?? 'http://127.0.0.1:3210';
const tmpDir = path.join(process.cwd(), 'test-results', 'pdf-print-views', 'tmp');

const EXPERTISE_FALLBACK_TITLE = 'Expertise Fallback Fixture';
const LONG_SPECIALTIES = '経験年数が長い順に列挙すると次のとおりで三十文字を超える得意分野の説明文になる';
const LONG_EXPERTISE = 'これも三十文字を超える長さになるよう調整した得意業務の説明文をここに入れておく';

let richSheetId = '';
let expertiseFallbackSheetId = '';

async function revalidateCache() {
  const secret = process.env.REVALIDATE_SECRET ?? 'revalidate-local';
  const res = await fetch(`${baseURL}/api/revalidate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) console.warn('revalidate failed:', res.status, await res.text());
}

async function cleanupSheetsByTitle(title: string) {
  const sheets = await listSheets();
  for (const s of sheets.filter((s) => s.title === title)) {
    await deleteSheet(s.id);
  }
}

/**
 * 「得意分野」「得意業務」を PROFILE_SHORT_VALUE_CHARS（30文字）超にした profile ブロックへ
 * 差し替えたシート。実データ相当ボリュームの project/skills ブロックはそのまま流用する
 * （テスト15の得意分野フォールバックは、これらが長い値のときにしか経路を通らないため）。
 */
function buildExpertiseFallbackBlocks(): BlockInput[] {
  return buildRealVolumeDemoBlocks().map((block) => {
    if (block.type !== 'profile') return block;
    const data = block.data as ProfileBlockData;
    return {
      ...block,
      data: {
        ...data,
        meta: { ...data.meta, specialties: LONG_SPECIALTIES, expertise: LONG_EXPERTISE },
      },
    } as BlockInput;
  });
}

async function authenticateViewer(page: Page) {
  await page.goto('/viewer-auth', { waitUntil: 'networkidle' });
  await page.getByLabel('認証コード').fill(viewerCode);
  await page.getByRole('button', { name: '認証' }).click();
  // 注意: /\/(view|view\/db)/ は「/viewer-auth」自体にも部分一致してしまい
  // （"/view" が "/viewer-auth" の先頭に含まれる）、遷移を待たずに即座に解決していた
  // （実測: 通過直後の cookies() が [] だった＝実際にはまだ /viewer-auth のまま）。
  // "/view" の直後が "/" か文字列終端であることを要求して "/viewer-auth" を除外する。
  await page.waitForURL(/\/view(\/|$)/);
}

async function openSheet(page: Page, sheetId: string) {
  await authenticateViewer(page);
  await page.goto(`/view/db/${sheetId}`, { waitUntil: 'networkidle' });
}

function skillMatrixSection(page: Page) {
  return page.locator('#section-skill-matrix');
}

function skillToggleButton(page: Page) {
  return page.getByRole('button', { name: /スキルマトリクス/ }).first();
}

function processToggleButton(page: Page) {
  return page.getByRole('button', { name: /工程の俯瞰/ }).first();
}

function exportButton(page: Page) {
  return page.getByRole('button', { name: /PDF(ダウンロード|を生成中)/ }).first();
}

function savePdfPath(label: string) {
  return path.join(tmpDir, `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`);
}

/** ダウンロードイベントを待って保存する。イベントが来なければ Playwright のタイムアウトで落ちる。 */
async function waitAndSaveDownload(page: Page, trigger: () => Promise<void>, label: string, timeout = 30_000) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout }), trigger()]);
  const savePath = savePdfPath(label);
  await download.saveAs(savePath);
  return savePath;
}

test.beforeAll(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  richSheetId = await createRealVolumeDemoSheet();
  await cleanupSheetsByTitle(EXPERTISE_FALLBACK_TITLE);
  expertiseFallbackSheetId = await createSheet(EXPERTISE_FALLBACK_TITLE, buildExpertiseFallbackBlocks());
  await revalidateCache();
});

test.afterAll(async () => {
  await cleanupSheetsByTitle(EXPERTISE_FALLBACK_TITLE);
});

// ---------------------------------------------------------------------------
// 1. 案件が会社ごとにまとまって表示されている（画面）
// Mutation: src/db/group-by-company.ts の groupProjectsByCompany を、全 item を
// 1 グループにまとめて返す実装に差し替える（`return [{ companyId: 'all', company: companies[0], items }];`）。
// ---------------------------------------------------------------------------
test('1. projects are grouped under company headings on screen', async ({ page }) => {
  await openSheet(page, richSheetId);

  const sections = page.locator('section[id^="company-"]');
  await expect(sections).toHaveCount(REAL_VOLUME_COMPANY_COUNT);

  const flagshipCompany = COMPANY_NAMES[0];
  const heading = page.getByRole('heading', { level: 2, name: flagshipCompany });
  await expect(heading).toBeVisible();

  // その会社の見出しを含む section の中に、その会社のフラグシップ案件タイトル「見出し」が
  // あることを確認する（＝会社と案件が同じグルーピング単位に属している。件数だけでなく
  // 所属先を見る）。getByText だと同じ文言を含む要約文（summary）にも部分一致して
  // strict mode violation になったため、案件タイトルの見出し（h3）に絞る。
  const section = page.locator('section[id^="company-"]', { has: heading });
  await expect(section.getByRole('heading', { name: REAL_VOLUME_FLAGSHIP_PROJECT_TITLE })).toBeVisible();
});

// ---------------------------------------------------------------------------
// 2. 表示切替「スキルマトリクス」を OFF にすると画面から消える
// Mutation: app/view/[path]/sheet-view-client.tsx の toggleView を
// `const toggleView = (view: ViewKey) => { if (view === 'skills') return; setViews(...); };`
// のように 'skills' のときだけ no-op にする。
// ---------------------------------------------------------------------------
test('2. toggling the skill-matrix view OFF removes it from the screen', async ({ page }) => {
  await openSheet(page, richSheetId);

  await expect(skillMatrixSection(page)).toBeVisible();
  await skillToggleButton(page).click();
  await expect(skillMatrixSection(page)).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// 3. OFF → ON で復帰する
// Mutation: toggleView を `setViews((prev) => prev.filter((v) => v !== view))` に変える
// （常に外すだけで、無いときに足す分岐が無い）。#2 は green のまま #3 だけ red になる。
// ---------------------------------------------------------------------------
test('3. toggling the skill-matrix view back ON restores it', async ({ page }) => {
  await openSheet(page, richSheetId);

  await skillToggleButton(page).click();
  await expect(skillMatrixSection(page)).toHaveCount(0);

  await skillToggleButton(page).click();
  const section = skillMatrixSection(page);
  await expect(section).toBeVisible();
  await expect(section).toContainText('スキルマトリクス');
});

// ---------------------------------------------------------------------------
// 4. OFF のまま出力した PDF にスキル一覧ページが無く、2ページ目が最初の会社から始まる
// Mutation: src/components/pdf/print-document.tsx の
// `const skillsPageRenders = vm.showSkills && vm.skillGroups.length > 0;` を
// `const skillsPageRenders = true;` に変える。
// ---------------------------------------------------------------------------
test('4. exporting while OFF omits the skills page and page 2 starts the first company', async ({ page }) => {
  await openSheet(page, richSheetId);
  await skillToggleButton(page).click();
  await expect(skillMatrixSection(page)).toHaveCount(0);

  const pdfPath = await waitAndSaveDownload(page, () => exportButton(page).click(), 'off');
  const pages = await extractPdfPages(pdfPath);

  expect(pages[0]).not.toContain('スキル一覧');
  expect(pages[1]).not.toContain('スキル一覧');
  expect(pages[1]).toContain(COMPANY_NAMES[0]);
});

// ---------------------------------------------------------------------------
// 5. ON の PDF はスキル一覧ページを独立したページとして持つ
// Mutation: skillsPageRenders を `false` 固定にする。
// ---------------------------------------------------------------------------
test('5. exporting while ON includes the skills page as its own page', async ({ page }) => {
  await openSheet(page, richSheetId);
  await expect(skillMatrixSection(page)).toBeVisible(); // デフォルト ON であることを確認してから出力する

  const pdfPath = await waitAndSaveDownload(page, () => exportButton(page).click(), 'on');
  const pages = await extractPdfPages(pdfPath);

  expect(pages[0]).not.toContain('スキル一覧');
  expect(pages[1]).toContain('スキル一覧');
});

// ---------------------------------------------------------------------------
// 6. ページをまたぐ会社セクションの継続見出しに、本物の会社名が乗っている
// Mutation: print-document.tsx の継続見出しテキストを
// `` `${companyLabel}（つづき）` `` から `'（つづき）'` に変える（会社名を落とす）。
// ---------------------------------------------------------------------------
test('6. the continuation header on a page break carries the real company name', async ({ page }) => {
  await openSheet(page, richSheetId);
  const pdfPath = await waitAndSaveDownload(page, () => exportButton(page).click(), 'continuation');
  const pages = await extractPdfPages(pdfPath);

  const companyNamePattern = COMPANY_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const withContinuation = new RegExp(`(?:${companyNamePattern})（つづき）`);

  const continuationPageIndex = pages.findIndex((text) => text.includes('（つづき）'));
  expect(continuationPageIndex, 'no page break with a continuation header was found at all').toBeGreaterThanOrEqual(0);
  expect(pages[continuationPageIndex]).toMatch(withContinuation);
});

// ---------------------------------------------------------------------------
// 7. 技術チップが全件表示され、「他N件」に畳まれない
// Mutation: src/components/pdf/print-view-model.ts の buildTechGroups で
// `const all = flattenTech(...)` の直後に `.slice(0, 6)` を足す。
// ---------------------------------------------------------------------------
test('7. technology chips print in full with no "他N件" abbreviation', async ({ page }) => {
  await openSheet(page, richSheetId);
  const pdfPath = await waitAndSaveDownload(page, () => exportButton(page).click(), 'tech-chips');
  const text = await extractPdfText(pdfPath);

  const flagshipTech = TECH_POOLS[0];
  const allTokens = [
    ...flagshipTech.lang,
    ...flagshipTech.fw,
    ...flagshipTech.db,
    ...flagshipTech.infra,
    ...flagshipTech.tools,
    ...flagshipTech.collab,
  ];
  const missing = allTokens.filter((t) => !text.includes(t));
  expect(missing, `missing tech tokens: ${missing.join(', ')}`).toHaveLength(0);
  expect(text).not.toMatch(/他\s*\d+\s*件/);
});

// ---------------------------------------------------------------------------
// 8. 破壊: フロー途中でリロードすると、デフォルト（全ビューON）に戻る
// Mutation: sheet-view-client.tsx の views を localStorage に永続化するよう変える
// （「永続化していない」というドキュメント済みの契約を破る）:
//   `useState<ViewKey[]>(() => JSON.parse(localStorage.getItem('views') ?? 'null') ?? [...ALL_VIEW_KEYS])`
//   + toggleView 内で `localStorage.setItem('views', JSON.stringify(next))`。
// ---------------------------------------------------------------------------
test('8. reloading mid-flow resets the view toggle to its default (not persisted)', async ({ page }) => {
  await openSheet(page, richSheetId);
  await skillToggleButton(page).click();
  await expect(skillMatrixSection(page)).toHaveCount(0);

  await page.reload({ waitUntil: 'networkidle' });

  await expect(skillMatrixSection(page)).toBeVisible();
});

// ---------------------------------------------------------------------------
// 9. 破壊: エクスポート後に戻る→進むしても、もう一度エクスポートできる
// Mutation: sheet-view-client.tsx の handleDownloadPdf の finally から
// `setPdfLoading(false);` を削除する。
// ---------------------------------------------------------------------------
test('9. exporting still works after navigating back and forward', async ({ page }) => {
  // 一覧画面からのクリック遷移ではなく直接 goto を使う: /view の一覧は
  // unstable_cache 経由で、ローカルでは REVALIDATE_SECRET 未設定のため
  // revalidateCache() が毎回 500 で失敗し、一覧が古い sheetId を指したままになる
  // （実測: クリックすると「ページが見つかりません」に着地し、この test が
  // ダウンロード待ちでタイムアウトしていた＝これは環境依存の固定待ちの脆さそのもの）。
  // ブラウザ履歴による戻る/進むという検証したい対象はそのままに、一覧のキャッシュ
  // 鮮度に依存しない経路にする。
  await openSheet(page, richSheetId);

  await waitAndSaveDownload(page, () => exportButton(page).click(), 'back-forward-1');

  await page.goBack({ waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/view$/);
  await page.goForward({ waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/view\/db\//);

  const btn = exportButton(page);
  await expect(btn).toBeEnabled();
  await waitAndSaveDownload(page, () => btn.click(), 'back-forward-2');
});

// ---------------------------------------------------------------------------
// 10. 破壊: エクスポートボタンを連打しても、ダウンロードは1回しか発生しない
// （「前のエクスポートが終わる前にもう一度エクスポートする」も同じガード
//  ＝ pdfLoading による disabled 制御でしか防げないため、ここに統合する）。
// Mutation: components/viewer-topbar.tsx の PDF ボタンから `disabled={pdfLoading}` を外す。
// ---------------------------------------------------------------------------
test('10. double-clicking the export button fires exactly one download', async ({ page }) => {
  await openSheet(page, richSheetId);

  const btn = exportButton(page);
  const downloads: number[] = [];
  page.on('download', () => downloads.push(Date.now()));

  await btn.dblclick();
  await page.waitForEvent('download', { timeout: 30_000 });
  // 2発目が飛んでくるかどうかを見るために、もう少し待ってから数える
  // （固定 sleep だが「来ないことの確認」に使っているだけで、来る場合の検出を遅らせているわけではない）。
  await page.waitForTimeout(2_000);

  expect(downloads.length).toBe(1);
  await expect(btn).toBeEnabled();
});

// ---------------------------------------------------------------------------
// 11. 破壊: トグルを連打しても、最終的な状態は正しい（OFF→ONで元に戻る）
// Mutation: toggleView を非関数形の setState に変える:
//   `setViews(views.includes(view) ? views.filter((v) => v !== view) : [...views, view]);`
// （クロージャが古い views を掴んだままなので、同期的な連打で2回とも同じ遷移になる）。
// ---------------------------------------------------------------------------
test('11. rapidly toggling the skill-matrix view twice ends up unchanged', async ({ page }) => {
  await openSheet(page, richSheetId);
  await expect(skillMatrixSection(page)).toBeVisible();

  const btn = skillToggleButton(page);
  await Promise.all([btn.click(), btn.click()]);

  await expect(skillMatrixSection(page)).toBeVisible();
});

// ---------------------------------------------------------------------------
// 12. 破壊: 狭いビューポート（320px）でもトグルとエクスポートが機能する
// （design-audit / adversarial.spec.ts の viewport sweep は「横スクロールが無い」しか
//  見ておらず、トグル・エクスポートの機能そのものは見ていない）。
// Mutation: viewer-topbar.tsx の PDF ボタンから `min-h-11 min-w-11` を外す。
// ---------------------------------------------------------------------------
test('12. the toggle and export button still work at a 320px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await openSheet(page, richSheetId);

  await skillToggleButton(page).click();
  await expect(skillMatrixSection(page)).toHaveCount(0);

  const btn = exportButton(page);
  const box = await btn.boundingBox();
  expect(box, 'export button has no visible box at 320px').not.toBeNull();
  if (box) {
    expect(box.width, 'export button hit target width < 44px at 320px').toBeGreaterThanOrEqual(43.5);
    expect(box.height, 'export button hit target height < 44px at 320px').toBeGreaterThanOrEqual(43.5);
  }
  await waitAndSaveDownload(page, () => btn.click(), 'narrow-viewport');
});

// ---------------------------------------------------------------------------
// 13. 独自追加(1): 無関係なビュー（工程の俯瞰）を切り替えても、スキルマトリクスは影響を受けない
// Mutation: viewer-topbar.tsx の onClick を全ボタン共通で `() => onToggleView('skills')` にする
// （コピペ事故の再現）。
// ---------------------------------------------------------------------------
test("13. toggling an unrelated view ('process') does not affect the skill matrix", async ({ page }) => {
  await openSheet(page, richSheetId);
  const section = skillMatrixSection(page);
  await expect(section).toBeVisible();
  const before = await section.innerText();

  await processToggleButton(page).click();

  await expect(section).toBeVisible();
  await expect(section).toHaveText(before);
});

// ---------------------------------------------------------------------------
// 14. 独自追加(2): スキルをOFFにしても「得意分野」「得意業務」が本文から消えない
// （print-document.tsx のコメントに記録されている過去の実バグ: スキル一覧ページ自体が
//  出ないとき、この行き先が無くなって本文ごと消えていた）。
// Mutation: print-document.tsx の `fallbackExpertiseRows={skillsPageRenders ? undefined : vm.summary.expertiseRows}`
// を `fallbackExpertiseRows={undefined}` に変える。
// ---------------------------------------------------------------------------
test('14. expertise rows survive on the summary page when skills are OFF', async ({ page }) => {
  await openSheet(page, expertiseFallbackSheetId);
  await skillToggleButton(page).click();
  await expect(skillMatrixSection(page)).toHaveCount(0);

  const pdfPath = await waitAndSaveDownload(page, () => exportButton(page).click(), 'expertise-fallback');
  const pages = await extractPdfPages(pdfPath);

  expect(pages[0]).toContain('得意分野');
  expect(pages[0]).toContain('得意業務');
  expect(pages[0]).toContain(LONG_SPECIALTIES);
  expect(pages[0]).toContain(LONG_EXPERTISE);
  expect(pages[0]).not.toContain('スキル一覧');
});

// ---------------------------------------------------------------------------
// 15. 独自追加(3): 継続見出しは、必ず実在する会社名を伴って出る（会社名が空の孤立見出しが無い）
// Mutation: print-document.tsx の継続見出し render から
// `if (!companyLabel && !projectLabel) return null;` を削除する。
// ---------------------------------------------------------------------------
test('15. every continuation marker is attached to a real company name, never bare', async ({ page }) => {
  await openSheet(page, richSheetId);
  const pdfPath = await waitAndSaveDownload(page, () => exportButton(page).click(), 'orphan-continuation');
  const text = await extractPdfText(pdfPath);

  const occurrences = text.match(/[^\n]{0,40}（つづき）/g) ?? [];
  expect(occurrences.length, 'expected at least one continuation header in this fixture').toBeGreaterThan(0);
  const companyNamePattern = COMPANY_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const bare = occurrences.filter((o) => !new RegExp(`(?:${companyNamePattern})（つづき）`).test(o));
  expect(bare, `bare/orphaned continuation marker(s) found: ${JSON.stringify(bare)}`).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// 16. 既存カバレッジの再確認（重複させない）: 誤った/空の認証コード、直リンク保護
// e2e/adversarial.spec.ts の test('E. auth edge cases') が既にこの2点を検証している。
// ここでは新規に書かず、その既存テストが green であることを別途手元で再実行して確認する
// （report 参照）。
// ---------------------------------------------------------------------------
