import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/pdf-layout-check.yml', import.meta.url), 'utf8');
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
it('未設定の対象はデータ取得前に拒否する', () => {
  const result = spawnSync('bash', ['-e', '-c', stepScript('Validate target sheet')], {
    env: { ...process.env, PDF_CHECK_DATABASE_URL: 'synthetic-db', PDF_CHECK_SHEET_ID: '' },
    encoding: 'utf8',
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('PDF_CHECK_SHEET_ID must be configured');
  expect(workflow.indexOf('- name: Validate target sheet')).toBeLessThan(
    workflow.indexOf('- name: Dump blocks from database'),
  );
});
it('専用DB設定の欠落は秘密値を出さずデータ取得前に拒否する', () => {
  const result = spawnSync('bash', ['-e', '-c', stepScript('Validate target sheet')], {
    env: { ...process.env, PDF_CHECK_DATABASE_URL: '', PDF_CHECK_SHEET_ID: '01234567-89ab-cdef-0123-456789abcdef' },
    encoding: 'utf8',
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('PDF_CHECK_DATABASE_URL must be configured');
  expect(workflow).not.toContain('secrets.DATABASE_URL');
});
it.each([
  ['Dump blocks from database', 'pdf-dump.log'],
  ['PDF layout check against real data', 'pdf-layout.log'],
])('%s は機密ログを公開せず終了コードを保持する', (step, logfile) => {
  const dir = mkdtempSync(join(tmpdir(), 'pdf-workflow-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'pnpm'), '#!/bin/bash\necho PRIVATE_RESUME_TEXT\necho PRIVATE_ERROR >&2\nexit 7\n', {
    mode: 0o700,
  });
  const result = spawnSync('bash', ['-e', '-c', stepScript(step)], {
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      RUNNER_TEMP: dir,
      PDF_CHECK_SHEET_ID: '01234567-89ab-cdef-0123-456789abcdef',
    },
    encoding: 'utf8',
  });
  expect(result.status).toBe(7);
  expect(result.stdout + result.stderr).not.toContain('PRIVATE');
  expect(result.stdout).toContain('exit 7');
  expect(readFileSync(join(dir, logfile), 'utf8')).toContain('PRIVATE_RESUME_TEXT');
  expect(statSync(join(dir, logfile)).mode & 0o777).toBe(0o600);
});
