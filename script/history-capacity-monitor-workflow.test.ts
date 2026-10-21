import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MIB } from '../src/db/history-capacity-model';
import { CANDIDATE_THRESHOLDS, evaluateMonitor } from '../src/db/history-capacity-monitor';
import { exitCode } from './history-capacity-monitor';
import { evaluateKeepalive, parseArgs } from './schedule-keepalive-check';

const workflowsDir = new URL('../.github/workflows/', import.meta.url);
const workflow = readFileSync(new URL('history-capacity-monitor.yml', workflowsDir), 'utf8');
const notify = readFileSync(new URL('ci-failure-notify.yml', workflowsDir), 'utf8');
const collector = new URL('./collect-history-capacity-sample.sh', import.meta.url).pathname;
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'history-monitor-workflow-'));
  dirs.push(dir);
  return dir;
}
function stepBody(name: string): string {
  const body = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - ')[0];
  if (body === undefined) throw new Error(`missing step ${name}`);
  return body;
}

const API_KEY = 'neon-key-must-not-leak';
const rawSample = {
  measuredAt: '2026-10-21T00:00:00Z',
  transactionReadOnly: 'on',
  databaseBytes: 9_609_216,
  allDatabasesBytes: 35_176_448,
  versionCount: 3,
  relations: { document_versions: { heapBytes: 8192, toastBytes: 8192, indexBytes: 16384, totalBytes: 32768 } },
};
const jqPath = spawnSync('/bin/sh', ['-c', 'command -v jq'], { encoding: 'utf8' }).stdout.trim();

/** 偽の psql と curl を置き、collector を開発者の shell 設定や資格情報なしで動かす。 */
function runCollector(options: { psqlFails?: boolean; logical?: string; env?: Record<string, string> } = {}) {
  const dir = tempDir();
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const fake = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/bin/bash\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  fake(
    'psql',
    options.psqlFails
      ? 'echo "could not connect to server at secret-host.example" >&2; exit 2'
      : `printf '%s\\n' "$*" > "${dir}/psql-args"; printf '%s\\n' "$PGOPTIONS" > "${dir}/psql-options"; printf '%s\\n' '${JSON.stringify(rawSample)}'`,
  );
  fake(
    'curl',
    `printf '%s\\n' "$*" > "${dir}/curl-args"; cat > "${dir}/curl-config"; printf '%s\\n' '{"branch":{"logical_size":${options.logical ?? '50782208'}}}'`,
  );
  const out = join(dir, 'sample.json');
  // bash 経由ではなく workflow と同じく直接起動する。実行権限が落ちたら（exit 126）ここで落ちる。
  const result = spawnSync(collector, [out], {
    env: {
      PATH: `${bin}:${dirname(jqPath)}:/usr/bin:/bin`,
      NODE_ENV: 'test',
      PGSERVICEFILE: join(dir, 'pg_service.conf'),
      HISTORY_MONITOR_PG_SERVICE: 'history-monitor',
      NEON_API_KEY: API_KEY,
      NEON_PROJECT_ID: 'calm-project-123',
      NEON_BRANCH_ID: 'br-main-456',
      ...options.env,
    },
    encoding: 'utf8',
  });
  const read = (name: string) => readFileSync(join(dir, name), 'utf8');
  return { result, sample: JSON.parse(read('sample.json')) as Record<string, unknown>, read };
}

describe('定期実行の workflow', () => {
  it('schedule だけで動き、本番 secret を読む手動実行の口を持たない', () => {
    expect(workflow).toMatch(/\non:\n {2}schedule:\n {4}# [^\n]+\n {4}- cron: '30 22 \* \* \*'\n/);
    expect(workflow).not.toMatch(/^\s*workflow_dispatch:/m);
    expect(workflow).not.toMatch(/^\s*(push|pull_request|pull_request_target):/m);
  });

  it('読取専用 role と監視キーが揃うまで、variable で明示的に有効にした時だけ走る', () => {
    expect(workflow).toContain("if: vars.HISTORY_MONITOR_ENABLED == 'true'");
  });

  it('失敗が既存の通知経路（Slack と追跡 issue）に乗る', () => {
    expect(workflow.split('\n')[0]).toBe('name: History Capacity Monitor');
    expect(notify).toContain('      - "History Capacity Monitor"\n');
  });

  it('秘密値は観測の step にだけ渡し、判定と停止確認には渡さない', () => {
    expect(workflow.match(/secrets\./g)).toHaveLength(2);
    expect(stepBody('Collect sample')).toContain('secrets.HISTORY_MONITOR_PG_SERVICE_CONF');
    expect(stepBody('Collect sample')).toContain('secrets.HISTORY_MONITOR_NEON_API_KEY');
    expect(stepBody('Judge capacity')).not.toContain('secrets.');
    expect(stepBody('Collect sample')).toContain('rm -f -- "$service_file"');
  });

  it('collector が起動すらできなくても、失敗の観測を最新として残す', () => {
    const cwd = tempDir();
    const script = stepBody('Collect sample')
      .split('        run: |\n')[1]
      ?.split('\n')
      .map((line) => line.replace(/^ {10}/, ''))
      .join('\n');
    if (!script) throw new Error('missing script in Collect sample');
    // cwd に script/ が無いので collector は 127 で落ちる（権限落ちの 126 と同じ「標本なし」の経路）。
    const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
      cwd,
      env: {
        PATH: `${dirname(jqPath)}:/usr/bin:/bin`,
        NODE_ENV: 'test',
        RUNNER_TEMP: cwd,
        PG_SERVICE_CONF: '[history-monitor]',
      },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    const files = readdirSync(join(cwd, 'history-samples'));
    expect(files).toHaveLength(1);
    const sample = JSON.parse(readFileSync(join(cwd, 'history-samples', files[0] ?? ''), 'utf8'));
    expect(sample.collectionError).toBe('collector exited 127 without a sample');
    expect(evaluateMonitor([sample]).status).toBe('measurement-failed');
    expect(readdirSync(cwd)).not.toContain('pg_service.conf');
  });

  it('容量の判定が落ちても停止間近の確認は流れる', () => {
    expect(stepBody('Check schedule keepalive')).toContain('if: always()');
    expect(workflow.indexOf('- name: Judge capacity')).toBeLessThan(
      workflow.indexOf('- name: Check schedule keepalive'),
    );
  });
});

describe('collect-history-capacity-sample.sh', () => {
  it('READ ONLY の観測に Neon の論理容量を足し、キーを引数に載せない', () => {
    const { result, sample, read } = runCollector();
    expect(result.status).toBe(0);
    expect(sample).toEqual({ ...rawSample, branchLogicalBytes: 50_782_208 });
    expect(read('psql-options')).toContain('default_transaction_read_only=on');
    expect(read('psql-args')).toContain('service=history-monitor');
    expect(read('curl-args')).toContain('/projects/calm-project-123/branches/br-main-456');
    expect(read('curl-args')).not.toContain(API_KEY);
    expect(read('curl-config')).toContain(`header = "Authorization: Bearer ${API_KEY}"`);
    expect(evaluateMonitor([sample]).status).toBe('normal');
  });

  it('照会の失敗は失敗の観測を最新として書き、接続先を出さず measurement-failed で落とす', () => {
    const { result, sample } = runCollector({ psqlFails: true });
    expect(result.status).toBe(1);
    expect(sample.collectionError).toBe('psql の照会が失敗した');
    expect(`${result.stdout}${result.stderr}`).not.toContain('secret-host');
    // 前日の正常な観測が残っていても、最新が失敗なら正常とは言わない。
    const yesterday = { ...rawSample, branchLogicalBytes: 1, measuredAt: '2026-10-20T00:00:00Z' };
    const monitor = evaluateMonitor([yesterday, sample]);
    expect(monitor.status).toBe('measurement-failed');
    expect(exitCode(monitor)).toBe(4);
  });

  it('Neon の応答に論理容量が無ければ失敗の観測にする', () => {
    const { result, sample } = runCollector({ logical: 'null' });
    expect(result.status).toBe(1);
    expect(sample.collectionError).toBe('Neon API から branch.logical_size を読めなかった');
  });

  it('未設定や形の不正な ID では照会もせず失敗の観測にする', () => {
    expect(runCollector({ env: { NEON_API_KEY: '' } }).sample.collectionError).toBe('NEON_API_KEY が未設定');
    expect(runCollector({ env: { NEON_BRANCH_ID: 'br-x/../../users' } }).sample.collectionError).toBe(
      'NEON_BRANCH_ID の形が不正',
    );
  });

  it('試しの警告（--database-limit-mib 1）で exceeded（3）になる', () => {
    const { sample } = runCollector({ logical: String(2 * MIB) });
    const monitor = evaluateMonitor([sample], { ...CANDIDATE_THRESHOLDS, databaseLimitBytes: 1 * MIB });
    expect(monitor.status).toBe('exceeded');
    expect(exitCode(monitor)).toBe(3);
  });
});

describe('schedule-keepalive-check', () => {
  const now = new Date('2026-10-21T00:00:00Z');
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

  it('最後のコミットから 45 日で停止間近（6）にし、60 日の無効化より前に知らせる', () => {
    expect(evaluateKeepalive(daysAgo(44), now)).toMatchObject({ status: 'ok', daysUntilDisabled: 16 });
    expect(evaluateKeepalive(daysAgo(45), now)).toMatchObject({ status: 'stale', daysUntilDisabled: 15 });
    expect(evaluateKeepalive(daysAgo(70), now)).toMatchObject({ status: 'stale', daysUntilDisabled: 0 });
  });

  it('未来日のコミットで余裕を水増ししない', () => {
    expect(evaluateKeepalive(daysAgo(-3), now)).toMatchObject({ status: 'ok', daysSinceActivity: 0 });
  });

  it('読めない日時と不正な引数は拒否する', () => {
    expect(() => evaluateKeepalive(new Date('not a date'), now)).toThrow('INVALID_DATE');
    expect(() => evaluateKeepalive(daysAgo(1), now, 60)).toThrow('INVALID_WARN_DAYS');
    expect(() => parseArgs([])).toThrow('LAST_ACTIVITY_REQUIRED');
    expect(() => parseArgs(['--last-activity'])).toThrow('INVALID_VALUE');
    expect(() => parseArgs(['--last-activity', '2026-10-01', '--warn-days', '0'])).toThrow('INVALID_VALUE');
  });
});
