import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/real-data-check.yml', import.meta.url), 'utf8');
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function stepScript(name: string): string {
  const step = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - name:')[0];
  const script = step?.split('        run: |\n')[1];
  if (!script) throw new Error(`missing step ${name}`);
  return script
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');
}
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'real-data-workflow-'));
  dirs.push(dir);
  return dir;
}
// 開発者のshell設定・資格情報・ツールshimを子プロセスへ引き継がない。
function runStep(name: string, cwd: string, env: Record<string, string>) {
  return spawnSync('/bin/bash', ['--noprofile', '--norc', '-e', '-c', stepScript(name)], {
    cwd,
    env: { PATH: `${cwd}/bin:/usr/bin:/bin`, NODE_ENV: 'test', ...env },
    encoding: 'utf8',
  });
}

it('未設定の対象はデータ取得前に拒否する', () => {
  const result = spawnSync('bash', ['-e', '-c', stepScript('Validate target sheet')], {
    env: { ...process.env, CHECK_DATABASE_URL: 'synthetic-db', CHECK_SHEET_ID: '' },
    encoding: 'utf8',
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('sheet id must be configured');
  expect(workflow.indexOf('- name: Validate target sheet')).toBeLessThan(
    workflow.indexOf('- name: Dump blocks from database'),
  );
});
it('専用DB設定の欠落は秘密値を出さずデータ取得前に拒否する', () => {
  const result = spawnSync('bash', ['-e', '-c', stepScript('Validate target sheet')], {
    env: { ...process.env, CHECK_DATABASE_URL: '', CHECK_SHEET_ID: '01234567-89ab-cdef-0123-456789abcdef' },
    encoding: 'utf8',
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('database URL secret must be configured');
  expect(workflow).not.toContain('secrets.DATABASE_URL');
});
it('DB の接続 URL は dump にだけ渡し、比較モードでは main 側のコードで dump する', () => {
  const dump = workflow.split('      - name: Dump blocks from database\n')[1]?.split('\n      - name:')[0] ?? '';
  expect(dump).toContain('working-directory:');
  expect(dump).toContain("inputs.base-ref != '' && 'base' || 'head'");
  expect(workflow.match(/secrets\.database-url/g)).toHaveLength(2);
  const run = workflow.split('      - name: Run checks against real data\n')[1]?.split('\n      - name:')[0] ?? '';
  expect(run).not.toContain('secrets.');
});
it('比較モードでは PR 側の依存（lifecycle script）を dump の後に、実データの無いコンテナで入れる', () => {
  const at = (name: string) => workflow.indexOf(`      - name: ${name}\n`);
  expect(at('Install dependencies (head, sandboxed)')).toBeGreaterThan(at('Dump blocks from database'));
  expect(at('Install dependencies (base)')).toBeLessThan(at('Dump blocks from database'));
  const head =
    workflow.split('      - name: Install dependencies (head, sandboxed)\n')[1]?.split('\n      - name:')[0] ?? '';
  expect(head).toContain("if: inputs.base-ref != ''");
  expect(head).toContain('docker run --rm');
  expect(head).toContain('--mount type=tmpfs,destination=/w/.git');
  expect(head).not.toContain('RUNNER_TEMP');
  expect(head).not.toContain('secrets.');
  const nightly =
    workflow.split('      - name: Install dependencies (nightly)\n')[1]?.split('\n      - name:')[0] ?? '';
  expect(nightly).toContain("if: inputs.base-ref == ''");
  expect(at('Install dependencies (nightly)')).toBeLessThan(at('Dump blocks from database'));
});
function fakeDocker(dir: string, body: string[]) {
  writeFileSync(
    join(dir, 'bin', 'docker'),
    ['#!/bin/bash', 'printf "%s\\n" "$@" > "$RUNNER_TEMP/docker-args"', ...body, ''].join('\n'),
    { mode: 0o700 },
  );
}
it('PR 用のコンテナは packageManager の pnpm の版だけを受け取り、形式が違えば作らない', () => {
  for (const [packageManager, ok] of [
    ['pnpm@10.33.0', true],
    ['pnpm@10.33.0; curl evil', false],
    ['npm@10.0.0', false],
  ] as const) {
    const dir = tempDir();
    mkdirSync(join(dir, 'bin'));
    mkdirSync(join(dir, 'head'));
    writeFileSync(join(dir, 'head', 'package.json'), JSON.stringify({ packageManager }));
    fakeDocker(dir, ['cat > "$RUNNER_TEMP/dockerfile"']);
    const result = runStep('Build sandbox for PR code', dir, { RUNNER_TEMP: dir, RASTER_DEPS: 'true' });
    expect(result.status).toBe(ok ? 0 : 1);
    if (!ok) {
      expect(() => readFileSync(join(dir, 'docker-args'))).toThrow();
      continue;
    }
    expect(readFileSync(join(dir, 'docker-args'), 'utf8')).toContain('PNPM_VERSION=10.33.0\n');
    expect(readFileSync(join(dir, 'dockerfile'), 'utf8')).toMatch(
      /^FROM node:22\.21\.1-bookworm-slim@sha256:[0-9a-f]{64}\n/,
    );
  }
});
it('Dump blocks from database は機密ログを公開せず終了コードを保持する', () => {
  const dir = tempDir();
  mkdirSync(join(dir, 'bin'));
  writeFileSync(join(dir, 'bin', 'pnpm'), '#!/bin/bash\necho PRIVATE_RESUME_TEXT\necho PRIVATE_ERROR >&2\nexit 7\n', {
    mode: 0o700,
  });
  const result = runStep('Dump blocks from database', dir, {
    RUNNER_TEMP: dir,
    CHECK_SHEET_ID: '01234567-89ab-cdef-0123-456789abcdef',
  });
  expect(result.status).toBe(7);
  expect(result.stdout + result.stderr).not.toContain('PRIVATE');
  expect(result.stdout).toContain('exit 7');
  const log = join(dir, 'real-data', 'dump.log');
  expect(readFileSync(log, 'utf8')).toContain('PRIVATE_RESUME_TEXT');
  expect(statSync(log).mode & 0o777).toBe(0o600);
});
it('Run checks は出力を非公開ファイルへ送り、PR 側はネットワーク無しのコンテナで動かす', () => {
  const dir = tempDir();
  mkdirSync(join(dir, 'bin'));
  mkdirSync(join(dir, 'head'));
  mkdirSync(join(dir, 'base'));
  writeFileSync(
    join(dir, 'bin', 'pnpm'),
    [
      '#!/bin/bash',
      'echo PRIVATE_RESUME_TEXT',
      's=unset; [ -n "$GITHUB_STEP_SUMMARY" ] && s=set; t=unset; [ -n "$ACTIONS_RUNTIME_TOKEN" ] && t=set',
      'echo "summary=$s token=$t cwd=$(basename "$PWD")" >> "$RUNNER_TEMP/seen"',
      'printf "%s\\n" "$@" > "$RUNNER_TEMP/args-$(basename "$PWD")"',
      'exit 3',
      '',
    ].join('\n'),
    { mode: 0o700 },
  );
  fakeDocker(dir, ['echo PRIVATE_RESUME_TEXT', 'echo "{}" > "$RUNNER_TEMP/real-data/out/head.json"', 'exit 4']);
  const blocks = join(dir, 'real-data', 'blocks.json');
  const result = runStep('Run checks against real data', dir, {
    RUNNER_TEMP: dir,
    GITHUB_WORKSPACE: dir,
    REAL_BLOCKS_JSON: blocks,
    BASE_REF: 'abc123',
    TEST_PATHS: 'src/a.node.test.tsx src/b.node.test.tsx',
    GITHUB_STEP_SUMMARY: join(dir, 'summary'),
    ACTIONS_RUNTIME_TOKEN: 'runtime-token',
  });
  // 検査が落ちても step は止めない（判定は Judge results が行う）。
  expect(result.status).toBe(0);
  expect(result.stdout + result.stderr).not.toContain('PRIVATE');
  expect(readFileSync(join(dir, 'real-data', 'head.exit'), 'utf8').trim()).toBe('4');
  expect(readFileSync(join(dir, 'real-data', 'base.exit'), 'utf8').trim()).toBe('3');
  expect(readFileSync(join(dir, 'real-data', 'head.json'), 'utf8').trim()).toBe('{}');
  expect(readFileSync(join(dir, 'real-data', 'head.log'), 'utf8')).toContain('PRIVATE_RESUME_TEXT');
  expect(statSync(join(dir, 'real-data', 'head.log')).mode & 0o777).toBe(0o600);
  // base（main 側）は runner 上で、公開経路になる環境変数を外して動かす。
  expect(readFileSync(join(dir, 'seen'), 'utf8')).toBe('summary=unset token=unset cwd=base\n');
  const args = readFileSync(join(dir, 'docker-args'), 'utf8').trim().split('\n');
  expect(args.slice(0, 4)).toEqual(['run', '--rm', '--network', 'none']);
  expect(args).toContain('type=tmpfs,destination=/w/.git');
  expect(args).toContain(`${blocks}:/data/blocks.json:ro`);
  // コンテナへ渡す環境変数はこの 3 つだけ（secret もトークンも渡さない）。
  expect(args.flatMap((a, i) => (args[i - 1] === '-e' ? [a] : []))).toEqual([
    'HOME=/tmp',
    'CI=true',
    'REAL_BLOCKS_JSON=/data/blocks.json',
  ]);
  expect(args.slice(args.indexOf('real-data-sandbox') + 1)).toEqual([
    'node',
    'node_modules/vitest/vitest.mjs',
    'run',
    '--config',
    'vitest.config.pdf.ts',
    '--maxWorkers=2',
    'src/a.node.test.tsx',
    'src/b.node.test.tsx',
    '--reporter=default',
    '--reporter=json',
    '--outputFile.json=/out/head.json',
  ]);
  expect(readFileSync(join(dir, 'args-base'), 'utf8')).toContain(`--outputFile.json=${dir}/real-data/base.json`);
});
it('Run checks は PR 側が置いたシンボリックリンクのレポートを受け取らない', () => {
  const dir = tempDir();
  mkdirSync(join(dir, 'bin'));
  mkdirSync(join(dir, 'head'));
  mkdirSync(join(dir, 'base'));
  writeFileSync(join(dir, 'bin', 'pnpm'), '#!/bin/bash\n', { mode: 0o700 });
  fakeDocker(dir, ['ln -s /etc/hostname "$RUNNER_TEMP/real-data/out/head.json"']);
  const result = runStep('Run checks against real data', dir, {
    RUNNER_TEMP: dir,
    GITHUB_WORKSPACE: dir,
    BASE_REF: 'abc123',
    TEST_PATHS: '',
  });
  expect(result.status).toBe(0);
  expect(() => readFileSync(join(dir, 'real-data', 'head.json'))).toThrow();
});
it('夜間（base なし）は head だけを検査し、TEST_PATHS が空なら全件を流す', () => {
  const dir = tempDir();
  mkdirSync(join(dir, 'bin'));
  mkdirSync(join(dir, 'head'));
  writeFileSync(join(dir, 'bin', 'pnpm'), '#!/bin/bash\nprintf "%s\\n" "$@" > "$RUNNER_TEMP/args"\n', { mode: 0o700 });
  const result = runStep('Run checks against real data', dir, { RUNNER_TEMP: dir, BASE_REF: '', TEST_PATHS: '' });
  expect(result.status).toBe(0);
  expect(readFileSync(join(dir, 'args'), 'utf8').trim().split('\n').slice(0, 5)).toEqual([
    'exec',
    'vitest',
    'run',
    '--config',
    'vitest.config.pdf.ts',
  ]);
  expect(() => readFileSync(join(dir, 'real-data', 'base.exit'))).toThrow();
});

type Assertion = { fullName: string; status: 'passed' | 'failed' };
function report(root: string, files: Record<string, Assertion[]>, success: boolean) {
  return JSON.stringify({
    success,
    testResults: Object.entries(files).map(([file, assertionResults]) => ({
      name: `${root}/${file}`,
      status: assertionResults.some((a) => a.status === 'failed') ? 'failed' : 'passed',
      assertionResults: assertionResults.map((a) => ({ ...a, failureMessages: ['PRIVATE_ASSERTION_TEXT'] })),
    })),
  });
}
function judge(opts: {
  head?: Record<string, Assertion[]>;
  base?: Record<string, Assertion[]>;
  headExit?: number;
  baseExit?: number;
  baseRef?: string;
  outcome?: string;
  log?: string;
}) {
  const dir = tempDir();
  const data = join(dir, 'real-data');
  mkdirSync(data);
  const write = (side: 'head' | 'base', files: Record<string, Assertion[]>) => {
    const ok = Object.values(files).every((list) => list.every((a) => a.status === 'passed'));
    // 比較モードの head はコンテナの /w で動くので、レポートのパスもそこから始まる。
    const root = side === 'head' && opts.baseRef ? '/w' : join(dir, side);
    writeFileSync(join(data, `${side}.json`), report(root, files, ok));
  };
  if (opts.head) write('head', opts.head);
  if (opts.base) write('base', opts.base);
  writeFileSync(join(data, 'head.exit'), `${opts.headExit ?? 0}\n`);
  if (opts.base) writeFileSync(join(data, 'base.exit'), `${opts.baseExit ?? 0}\n`);
  writeFileSync(join(data, 'head.log'), opts.log ?? 'PRIVATE_RESUME_TEXT\n');
  return runStep('Judge results', dir, {
    RUNNER_TEMP: dir,
    GITHUB_WORKSPACE: dir,
    CHECK_NAME: 'PDF',
    TEST_OUTCOME: opts.outcome ?? 'success',
    BASE_REF: opts.baseRef ?? '',
  });
}
const pass = (fullName: string): Assertion => ({ fullName, status: 'passed' });
const fail = (fullName: string): Assertion => ({ fullName, status: 'failed' });

it('夜間: 全件通れば成功し、件数行だけを公開ログへ出す', () => {
  const result = judge({
    head: { 'src/a.node.test.tsx': [pass('崩れない')] },
    log: 'PRIVATE_RESUME_TEXT\n PDF_LAYOUT_COUNTS overflow=0\nPDF_LAYOUT_COUNTS PRIVATE_RESUME_TEXT\n',
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('PDF_LAYOUT_COUNTS overflow=0');
  expect(result.stdout).not.toContain('PRIVATE');
});
it('夜間: 落ちたテストの ID を出して失敗する（assertion の文は出さない）', () => {
  const result = judge({ head: { 'src/a.node.test.tsx': [fail('はみ出さない')] }, headExit: 1 });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('× src/a.node.test.tsx::はみ出さない');
  expect(result.stdout).not.toContain('PRIVATE');
});
it('検査を最後まで実行できなかった時は崩れと判定せずに失敗する', () => {
  const result = judge({ outcome: 'skipped' });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('検査を最後まで実行できなかった');
});
it('比較: base は通るのに head で落ちたテストだけを PR の失敗にする', () => {
  const result = judge({
    baseRef: 'abc',
    head: { 'src/a.node.test.tsx': [fail('はみ出さない'), fail('データ由来')] },
    base: { 'src/a.node.test.tsx': [pass('はみ出さない'), fail('データ由来')] },
    headExit: 1,
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('× src/a.node.test.tsx::はみ出さない');
  expect(result.stdout).toContain('base でも × src/a.node.test.tsx::データ由来');
  expect(result.stdout).not.toContain('× src/a.node.test.tsx::データ由来\n× ');
  expect(result.stdout).not.toContain('PRIVATE');
});
it('比較: base でも落ちる失敗だけなら警告に留めて通す', () => {
  const result = judge({
    baseRef: 'abc',
    head: { 'src/a.node.test.tsx': [fail('データ由来')] },
    base: { 'src/a.node.test.tsx': [fail('データ由来')] },
    headExit: 1,
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('::warning::PDF');
});
it('比較: PR で追加・改名されたテストの名前は公開ログへ出さない', () => {
  const result = judge({
    baseRef: 'abc',
    head: { 'src/a.node.test.tsx': [fail('PRIVATE_NAME_FROM_PR')] },
    base: { 'src/a.node.test.tsx': [pass('既存のテスト')] },
    headExit: 1,
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('× src/a.node.test.tsx::（この PR で追加・改名されたテスト）');
  expect(result.stdout).not.toContain('PRIVATE');
});
it('比較: base の検査結果が無ければ崩れと判定せずに失敗する', () => {
  const result = judge({ baseRef: 'abc', head: { 'src/a.node.test.tsx': [pass('崩れない')] } });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('base（main 側）の検査を最後まで実行できなかった');
});
it('比較: base で落ちていたテストを PR が直した時は成功にする', () => {
  const result = judge({
    baseRef: 'abc',
    head: { 'src/a.node.test.tsx': [pass('データ由来')] },
    base: { 'src/a.node.test.tsx': [fail('データ由来')] },
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('この PR の変更で新たに落ちたテストはない');
});
it('比較: テストは全件通っても head の実行が異常終了したら PR の失敗にする', () => {
  const result = judge({
    baseRef: 'abc',
    head: { 'src/a.node.test.tsx': [pass('崩れない')] },
    base: { 'src/a.node.test.tsx': [pass('崩れない')] },
    headExit: 1,
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('× (run)');
});
it('比較: base の実行も同じく異常終了していれば警告に留めて通す', () => {
  const result = judge({
    baseRef: 'abc',
    head: { 'src/a.node.test.tsx': [pass('崩れない')] },
    base: { 'src/a.node.test.tsx': [pass('崩れない')] },
    headExit: 1,
    baseExit: 1,
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('base でも × (run)');
});
it('夜間: テストは全件通っても実行が異常終了したら失敗にする', () => {
  const result = judge({ head: { 'src/a.node.test.tsx': [pass('崩れない')] }, headExit: 1 });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('× (run)');
});
it('比較: base に無いテストファイルはパスも公開ログへ出さない', () => {
  const result = judge({
    baseRef: 'abc',
    head: { 'src/PRIVATE_FILE.node.test.tsx': [fail('PRIVATE_NAME_FROM_PR')], 'src/a.node.test.tsx': [pass('既存')] },
    base: { 'src/a.node.test.tsx': [pass('既存')] },
    headExit: 1,
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('× （この PR で追加・改名されたテストファイル）');
  expect(result.stdout).not.toContain('PRIVATE');
});
