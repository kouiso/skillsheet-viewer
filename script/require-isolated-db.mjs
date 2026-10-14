// e2e を動かす前の関門。使い捨ての隔離 DB（script/e2e-isolated-db.sh が立てる）以外へ向いていれば止める。
//
// e2e は migrate・行作成・principals の張替えを DB に対して行う。playwright.config.ts は .env.local を
// 自分で読み込むため、何も指定せずに動かすと、正本の共有 DB（本番）を指す DATABASE_URL を拾って
// 本番データを壊す（#346）。「専用 DB を要求する手順」を CI の step に置く方式では手元の実行を守れないので、
// 実行する側で、向け先が隔離 DB であることを必須にする。
//
// playwright.config.ts（.ts）と headless-e2e.mjs の両方から使うため、実体は .mjs に置く。
//
// .env.local を読み込む前の process.env を見ること。読んだ後では本番の URL が混ざって判定できない。

/** 隔離 DB の接続 URL。role 名は script/e2e-isolated-db.sh の OWNER_ROLE と揃える（テストで固定）。 */
export const ISOLATED_DATABASE_URL = 'postgresql://e2e_owner@localhost/postgres';
export const ISOLATED_PROXY_PATTERN = /^127\.0\.0\.1:[1-9][0-9]{0,4}\/[0-9a-f-]{36}$/;
export const ISOLATED_PRELOAD = 'isolated-neon-preload.mjs';

/** @param {Record<string, string | undefined>} env */
export function assertIsolatedE2eEnv(env) {
  const problems = [];
  if (env.DATABASE_URL !== ISOLATED_DATABASE_URL) {
    problems.push('DATABASE_URL が隔離 DB を指していない（本番・共有の DB を指している可能性がある）');
  }
  if (!ISOLATED_PROXY_PATTERN.test(env.ISOLATED_NEON_PROXY ?? '')) {
    problems.push('ISOLATED_NEON_PROXY が隔離 DB への橋渡しを指していない');
  }
  if (!(env.NODE_OPTIONS ?? '').includes(ISOLATED_PRELOAD)) {
    problems.push(`NODE_OPTIONS に ${ISOLATED_PRELOAD} が入っていない（アプリが隔離 DB へ向かない）`);
  }
  if (problems.length === 0) return;
  throw new Error(
    [
      'e2e は使い捨ての隔離 DB でだけ動かせる（本番・共有の DB を壊さないため）。',
      ...problems.map((problem) => `- ${problem}`),
      '次のどちらかで動かす:',
      '  pnpm test:e2e:local',
      '  ./script/e2e-isolated-db.sh run pnpm test:e2e:playwright',
    ].join('\n'),
  );
}
