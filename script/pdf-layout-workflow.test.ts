import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/real-data-check.yml', import.meta.url), 'utf8');
const prWorkflow = readFileSync(new URL('../.github/workflows/real-data-pr-check.yml', import.meta.url), 'utf8');
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function stepScript(name: string, source = workflow): string {
  const step = source.split(`      - name: ${name}\n`)[1]?.split('\n      - name:')[0];
  const script = step?.split('        run: |\n')[1];
  if (!script) throw new Error(`missing step ${name}`);
  return script
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');
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
it.each([
  ['Dump blocks from database', 'pdf-dump.log'],
  ['Run checks against real data', 'pdf-check.log'],
])('%s は機密ログを公開せず終了コードを保持する', (step, logfile) => {
  const dir = mkdtempSync(join(tmpdir(), 'pdf-workflow-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'pnpm'), '#!/bin/bash\necho PRIVATE_RESUME_TEXT\necho PRIVATE_ERROR >&2\nexit 7\n', {
    mode: 0o700,
  });
  const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-e', '-c', stepScript(step)], {
    env: {
      // 開発者のshell設定・資格情報・ツールshimを子プロセスへ引き継がない。
      // この試験で起動を許すpnpmは上記の合成stubだけ。
      PATH: `${dir}:/usr/bin:/bin`,
      NODE_ENV: 'test',
      RUNNER_TEMP: dir,
      LOG_PREFIX: 'pdf',
      CHECK_SHEET_ID: '01234567-89ab-cdef-0123-456789abcdef',
    },
    encoding: 'utf8',
  });
  expect(result.status).toBe(7);
  expect(result.stdout + result.stderr).not.toContain('PRIVATE');
  expect(result.stdout).toContain('exit 7');
  expect(readFileSync(join(dir, logfile), 'utf8')).toContain('PRIVATE_RESUME_TEXT');
  expect(statSync(join(dir, logfile)).mode & 0o777).toBe(0o600);
});

it('Run checks は TEST_PATHS の各ファイルだけを vitest に渡す', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pdf-workflow-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'pnpm'), '#!/bin/bash\nprintf "%s\\n" "$@" > "$RUNNER_TEMP/args"\n', { mode: 0o700 });
  const run = (testPaths: string) => {
    const result = spawnSync(
      '/bin/bash',
      ['--noprofile', '--norc', '-e', '-c', stepScript('Run checks against real data')],
      {
        env: {
          PATH: `${dir}:/usr/bin:/bin`,
          NODE_ENV: 'test',
          RUNNER_TEMP: dir,
          LOG_PREFIX: 'xlsx',
          TEST_PATHS: testPaths,
        },
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(0);
    return readFileSync(join(dir, 'args'), 'utf8').trim().split('\n');
  };
  expect(run('src/a.node.test.tsx src/b.node.test.tsx')).toEqual([
    'exec',
    'vitest',
    'run',
    '--config',
    'vitest.config.pdf.ts',
    'src/a.node.test.tsx',
    'src/b.node.test.tsx',
  ]);
  expect(run('')).toEqual(['exec', 'vitest', 'run', '--config', 'vitest.config.pdf.ts']);
});
it.each([
  ['passed', 'passed', 0, ''],
  ['failed', 'passed', 1, '::error::PDF'],
  ['', 'passed', 1, '::error::PDF'],
  ['failed', 'failed', 0, '::warning::PDF'],
  ['passed', 'failed', 0, ''],
])('PR の判定: head=%s base=%s なら exit %i', (head, base, code, marker) => {
  const result = spawnSync(
    '/bin/bash',
    ['--noprofile', '--norc', '-e', '-c', stepScript('Compare head with base', prWorkflow)],
    {
      env: {
        PATH: '/usr/bin:/bin',
        NODE_ENV: 'test',
        HEAD_JOB: 'success',
        PDF_HEAD: head,
        PDF_BASE: base,
        XLSX_HEAD: 'passed',
        XLSX_BASE: 'passed',
      },
      encoding: 'utf8',
    },
  );
  expect(result.status).toBe(code);
  if (marker) expect(result.stdout).toContain(marker);
});
it('fork や draft で検査を飛ばした PR は判定を通す', () => {
  const result = spawnSync(
    '/bin/bash',
    ['--noprofile', '--norc', '-e', '-c', stepScript('Compare head with base', prWorkflow)],
    {
      env: { PATH: '/usr/bin:/bin', NODE_ENV: 'test', HEAD_JOB: 'skipped' },
      encoding: 'utf8',
    },
  );
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('::notice::');
});
