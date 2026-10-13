import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const workflowsDir = new URL('../.github/workflows/', import.meta.url);
const workflow = readFileSync(new URL('real-data-check.yml', workflowsDir), 'utf8');
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function stepBody(name: string): string {
  const body = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - name:')[0];
  if (body === undefined) throw new Error(`missing step ${name}`);
  return body;
}
function stepScript(name: string): string {
  const script = stepBody(name).split('        run: |\n')[1];
  if (!script) throw new Error(`missing script in step ${name}`);
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
  return spawnSync('/bin/bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', stepScript(name)], {
    cwd,
    env: { PATH: `${cwd}/bin:/usr/bin:/bin`, NODE_ENV: 'test', ...env },
    encoding: 'utf8',
  });
}
const at = (name: string) => workflow.indexOf(`      - name: ${name}\n`);

it('未設定の対象はデータ取得前に拒否する', () => {
  const result = spawnSync('bash', ['-e', '-c', stepScript('Validate target sheet')], {
    env: { ...process.env, CHECK_DATABASE_URL: 'synthetic-db', CHECK_SHEET_ID: '' },
    encoding: 'utf8',
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('sheet id must be configured');
  expect(at('Validate target sheet')).toBeLessThan(at('Dump blocks from database'));
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
it('DB の接続 URL は検証と dump の 2 step にだけ渡す', () => {
  expect(workflow.match(/secrets\.database-url/g)).toHaveLength(2);
  expect(stepBody('Validate target sheet')).toContain('secrets.database-url');
  expect(stepBody('Dump blocks from database')).toContain('secrets.database-url');
  expect(stepBody('Run checks against real data')).not.toContain('secrets.');
});

// 実データに触れる前の関門。main の祖先でない commit（PR の merge commit・feature ブランチ）は止める。
function gitIn(cwd: string, ...args: string[]) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      PATH: '/usr/bin:/bin',
      NODE_ENV: 'test',
      HOME: cwd,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.test',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.test',
    },
  });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}
function repoWithOrigin() {
  const root = tempDir();
  const origin = join(root, 'origin.git');
  const work = join(root, 'work');
  mkdirSync(origin);
  mkdirSync(work);
  gitIn(origin, 'init', '--bare', '-b', 'main');
  gitIn(work, 'init', '-b', 'main');
  gitIn(work, 'remote', 'add', 'origin', origin);
  writeFileSync(join(work, 'a.txt'), 'a');
  gitIn(work, 'add', '.');
  gitIn(work, 'commit', '-m', 'main commit');
  gitIn(work, 'push', 'origin', 'main');
  return { work, root };
}
it('main に含まれる commit は関門を通り、含まれない commit は止まる', () => {
  const { work } = repoWithOrigin();
  const onMain = runStep('Verify the checked-out commit is on main', work, {});
  expect(onMain.status).toBe(0);

  gitIn(work, 'checkout', '-b', 'feature');
  writeFileSync(join(work, 'b.txt'), 'b');
  gitIn(work, 'add', '.');
  gitIn(work, 'commit', '-m', 'feature commit');
  const offMain = runStep('Verify the checked-out commit is on main', work, {});
  expect(offMain.status).toBe(1);
  expect(offMain.stdout).toContain('main に含まれていない');
});
it('main より古い commit（続けて merge された時の先の実行）は通す', () => {
  const { work } = repoWithOrigin();
  const first = gitIn(work, 'rev-parse', 'HEAD');
  writeFileSync(join(work, 'c.txt'), 'c');
  gitIn(work, 'add', '.');
  gitIn(work, 'commit', '-m', 'second main commit');
  gitIn(work, 'push', 'origin', 'main');
  gitIn(work, 'checkout', '--detach', first);
  expect(runStep('Verify the checked-out commit is on main', work, {}).status).toBe(0);
});
it('main の関門は、依存のインストールと secret を使う step より前にある', () => {
  const gate = at('Verify the checked-out commit is on main');
  for (const later of [
    'Setup pnpm',
    'Install dependencies',
    'Validate target sheet',
    'Dump blocks from database',
    'Run checks against real data',
  ]) {
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(at(later));
  }
  // 全履歴が無いと merge-base で祖先かどうかを判定できない。
  expect(workflow).toContain('fetch-depth: 0');
});
it('実データの検査を呼ぶ workflow は PR から起動されない', () => {
  const callers = readdirSync(workflowsDir).filter(
    (file) =>
      file.endsWith('.yml') &&
      /uses:\s*kouiso\/skillsheet-viewer\/\.github\/workflows\/real-data-check\.yml@main/.test(
        readFileSync(new URL(file, workflowsDir), 'utf8'),
      ),
  );
  expect(callers.sort()).toEqual(['real-data-main-check.yml', 'xlsx-format-check.yml']);
  for (const file of callers) {
    const text = readFileSync(new URL(file, workflowsDir), 'utf8');
    const onBlock = text.split(/^on:\n/m)[1]?.split(/^\S/m)[0] ?? '';
    expect(onBlock, file).not.toMatch(/pull_request/);
  }
  // 本体は必ずこのリポジトリの @main から呼ぶ。呼び出し側が持つ写しに左右されないよう固定する。
  // 外部のリポジトリや他の ref も許さない。
  for (const file of readdirSync(workflowsDir).filter((f) => f.endsWith('.yml'))) {
    const text = readFileSync(new URL(file, workflowsDir), 'utf8');
    for (const [, ref] of text.matchAll(/uses:\s*(\S*real-data-check\.yml\S*)/g)) {
      expect(ref, file).toBe('kouiso/skillsheet-viewer/.github/workflows/real-data-check.yml@main');
    }
  }
});
it('merge 後の検査は commit ごとの group で、他の commit の実行を止めない', () => {
  const text = readFileSync(new URL('real-data-main-check.yml', workflowsDir), 'utf8');
  expect(text).toMatch(/group: real-data-main-check-\$\{\{ github\.sha \}\}/);
  expect(text).toMatch(/cancel-in-progress: false/);
  expect(text).not.toMatch(/cancel-in-progress: true/);
});
it('本番 DB の secret を渡す workflow に、ブランチを選べる手動実行を置かない', () => {
  // workflow_dispatch は選んだブランチのファイルそのものを動かすので、steps を差し替えて secret を読める。
  for (const file of ['real-data-main-check.yml', 'xlsx-format-check.yml']) {
    const text = readFileSync(new URL(file, workflowsDir), 'utf8');
    const onBlock = text.split(/^on:\n/m)[1]?.split(/^\S/m)[0] ?? '';
    expect(onBlock, file).not.toMatch(/^\s+workflow_dispatch:/m);
  }
});
it('PR 用の実データ検査 workflow は存在しない', () => {
  expect(readdirSync(workflowsDir)).not.toContain('real-data-pr-check.yml');
});
it('merge 後の main の検査は main への push だけで動き、失敗は通知の対象になる', () => {
  const text = readFileSync(new URL('real-data-main-check.yml', workflowsDir), 'utf8');
  const onBlock = text.split(/^on:\n/m)[1]?.split(/^\S/m)[0] ?? '';
  expect(onBlock).toMatch(/push:\s*\n\s*branches: \[main\]/);
  expect(text).toContain('name: Real Data Check (main)');
  expect(text).toMatch(/secrets:\s*\n\s*database-url: \$\{\{ secrets\.PDF_CHECK_DATABASE_URL \}\}/);
  expect(text).toMatch(/secrets:\s*\n\s*database-url: \$\{\{ secrets\.XLSX_CHECK_DATABASE_URL \}\}/);
  const notify = readFileSync(new URL('ci-failure-notify.yml', workflowsDir), 'utf8');
  expect(notify).toContain('- "Real Data Check (main)"');
  expect(notify).toMatch(/DEVIN_TARGET:.*"Real Data Check \(main\)"/);
});
it('merge 後の検査は、本体を @main から呼ぶ', () => {
  const text = readFileSync(new URL('real-data-main-check.yml', workflowsDir), 'utf8');
  const uses = [...text.matchAll(/^\s+uses: (\S+)$/gm)].map((m) => m[1]);
  expect(uses).toEqual([
    'kouiso/skillsheet-viewer/.github/workflows/real-data-check.yml@main',
    'kouiso/skillsheet-viewer/.github/workflows/real-data-check.yml@main',
  ]);
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
it('Run checks は出力を非公開ファイルへ送り、公開経路になる環境変数を検査対象コードから外す', () => {
  const dir = tempDir();
  mkdirSync(join(dir, 'bin'));
  writeFileSync(
    join(dir, 'bin', 'pnpm'),
    [
      '#!/bin/bash',
      'echo PRIVATE_RESUME_TEXT',
      's=unset; [ -n "$GITHUB_STEP_SUMMARY" ] && s=set; t=unset; [ -n "$ACTIONS_RUNTIME_TOKEN" ] && t=set',
      'echo "summary=$s token=$t" >> "$RUNNER_TEMP/seen"',
      'printf "%s\\n" "$@" > "$RUNNER_TEMP/args"',
      'exit 3',
      '',
    ].join('\n'),
    { mode: 0o700 },
  );
  const result = runStep('Run checks against real data', dir, {
    RUNNER_TEMP: dir,
    TEST_PATHS: 'src/a.node.test.tsx src/b.node.test.tsx',
    GITHUB_STEP_SUMMARY: join(dir, 'summary'),
    ACTIONS_RUNTIME_TOKEN: 'runtime-token',
  });
  // 検査が落ちても step は止めない（判定は Judge results が行う）。
  expect(result.status).toBe(0);
  expect(result.stdout + result.stderr).not.toContain('PRIVATE');
  expect(readFileSync(join(dir, 'real-data', 'report.exit'), 'utf8').trim()).toBe('3');
  expect(readFileSync(join(dir, 'real-data', 'report.log'), 'utf8')).toContain('PRIVATE_RESUME_TEXT');
  expect(statSync(join(dir, 'real-data', 'report.log')).mode & 0o777).toBe(0o600);
  expect(readFileSync(join(dir, 'seen'), 'utf8')).toBe('summary=unset token=unset\n');
  expect(readFileSync(join(dir, 'args'), 'utf8').trim().split('\n')).toEqual([
    'exec',
    'vitest',
    'run',
    '--config',
    'vitest.config.pdf.ts',
    '--maxWorkers=2',
    'src/a.node.test.tsx',
    'src/b.node.test.tsx',
    '--reporter=default',
    '--reporter=json',
    `--outputFile.json=${dir}/real-data/report.json`,
  ]);
});
it('TEST_PATHS が空なら *.node.test.tsx を全件流す', () => {
  const dir = tempDir();
  mkdirSync(join(dir, 'bin'));
  writeFileSync(join(dir, 'bin', 'pnpm'), '#!/bin/bash\nprintf "%s\\n" "$@" > "$RUNNER_TEMP/args"\n', { mode: 0o700 });
  const result = runStep('Run checks against real data', dir, { RUNNER_TEMP: dir, TEST_PATHS: '' });
  expect(result.status).toBe(0);
  expect(readFileSync(join(dir, 'args'), 'utf8').trim().split('\n').slice(0, 6)).toEqual([
    'exec',
    'vitest',
    'run',
    '--config',
    'vitest.config.pdf.ts',
    '--maxWorkers=2',
  ]);
});

type Assertion = { fullName: string; status: 'passed' | 'failed' };
function judge(opts: {
  files?: Record<string, Assertion[]>;
  exit?: number;
  outcome?: string;
  log?: string;
  rawReport?: string;
}) {
  const dir = tempDir();
  const data = join(dir, 'real-data');
  mkdirSync(data);
  if (opts.rawReport !== undefined) {
    writeFileSync(join(data, 'report.json'), opts.rawReport);
  } else if (opts.files) {
    const ok = Object.values(opts.files).every((list) => list.every((a) => a.status === 'passed'));
    writeFileSync(
      join(data, 'report.json'),
      JSON.stringify({
        success: ok,
        testResults: Object.entries(opts.files).map(([file, assertionResults]) => ({
          name: `${dir}/${file}`,
          status: assertionResults.some((a) => a.status === 'failed') ? 'failed' : 'passed',
          assertionResults: assertionResults.map((a) => ({ ...a, failureMessages: ['PRIVATE_ASSERTION_TEXT'] })),
        })),
      }),
    );
  }
  writeFileSync(join(data, 'report.exit'), `${opts.exit ?? 0}\n`);
  writeFileSync(join(data, 'report.log'), opts.log ?? 'PRIVATE_RESUME_TEXT\n');
  return runStep('Judge results', dir, {
    RUNNER_TEMP: dir,
    GITHUB_WORKSPACE: dir,
    CHECK_NAME: 'PDF',
    TEST_OUTCOME: opts.outcome ?? 'success',
  });
}
const pass = (fullName: string): Assertion => ({ fullName, status: 'passed' });
const fail = (fullName: string): Assertion => ({ fullName, status: 'failed' });

it('全件通れば成功し、件数行だけを公開ログへ出す', () => {
  const result = judge({
    files: { 'src/a.node.test.tsx': [pass('崩れない')] },
    log: 'PRIVATE_RESUME_TEXT\n PDF_LAYOUT_COUNTS overflow=0\nPDF_LAYOUT_COUNTS PRIVATE_RESUME_TEXT\n',
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('PDF_LAYOUT_COUNTS overflow=0');
  expect(result.stdout).toContain('PDF: 実データで通過');
  expect(result.stdout).not.toContain('PRIVATE');
});
it('落ちたテストの ID を出して失敗する（assertion の文は出さない）', () => {
  const result = judge({ files: { 'src/a.node.test.tsx': [fail('はみ出さない'), pass('崩れない')] }, exit: 1 });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('× src/a.node.test.tsx::はみ出さない');
  expect(result.stdout).not.toContain('崩れない');
  expect(result.stdout).not.toContain('PRIVATE');
});
it('検査を最後まで実行できなかった時は崩れと判定せずに失敗する', () => {
  const skipped = judge({ outcome: 'skipped' });
  expect(skipped.status).toBe(1);
  expect(skipped.stdout).toContain('検査を最後まで実行できなかった');
  const noReport = judge({});
  expect(noReport.status).toBe(1);
  expect(noReport.stdout).toContain('検査を最後まで実行できなかった');
  const broken = judge({ rawReport: '{ PRIVATE_BROKEN' });
  expect(broken.status).toBe(1);
  expect(broken.stdout + broken.stderr).not.toContain('PRIVATE');
});
it('形が崩れた JSON レポートは、中の値を公開ログに出さず失敗にする', () => {
  for (const rawReport of [
    JSON.stringify({
      success: false,
      testResults: [{ name: 'a', status: 'failed', assertionResults: 'PRIVATE_TEXT' }],
    }),
    JSON.stringify({
      success: false,
      testResults: [
        { name: 'a', status: 'failed', assertionResults: [{ status: 'failed', fullName: { v: 'PRIVATE_TEXT' } }] },
      ],
    }),
    JSON.stringify({ success: 'PRIVATE_TEXT', testResults: [] }),
    JSON.stringify({ success: false, testResults: 'PRIVATE_TEXT' }),
  ]) {
    const result = judge({ rawReport, exit: 1 });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('検査を最後まで実行できなかった');
    expect(result.stdout + result.stderr).not.toContain('PRIVATE');
  }
});
it('テストは全件通っても実行が異常終了したら (run) の失敗にする', () => {
  const result = judge({ files: { 'src/a.node.test.tsx': [pass('崩れない')] }, exit: 1 });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('× (run)');
});
it('落ちたテストがあっても未処理の例外を別に数える', () => {
  const result = judge({
    files: { 'src/a.node.test.tsx': [fail('データ由来')] },
    exit: 1,
    log: '\u001b[31mVitest caught 1 unhandled error during the test run.\u001b[39m\nPRIVATE_RESUME_TEXT\n',
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('× (unhandled)');
  expect(result.stdout).toContain('× src/a.node.test.tsx::データ由来');
  expect(result.stdout).not.toContain('PRIVATE');
});
