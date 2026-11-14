import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const hookPath = process.env.GRAPH_HOOK_PATH ?? path.resolve(__dirname, '../.claude/hooks/code-review-graph-hook.sh');

// 偽の code-review-graph を PATH の先頭に置いてフックを動かす
const runHook = (stubBody: string, mode: 'update' | 'status', timeoutSec?: string) => {
  const bin = mkdtempSync(path.join(tmpdir(), 'crg-stub-'));
  const stub = path.join(bin, 'code-review-graph');
  writeFileSync(stub, `#!/bin/sh\n${stubBody}\n`);
  chmodSync(stub, 0o755);
  const result = spawnSync('sh', [hookPath, mode], {
    input: '{}',
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      ...(timeoutSec ? { CODE_REVIEW_GRAPH_HOOK_TIMEOUT: timeoutSec } : {}),
    },
  });
  return result;
};

const parseMessage = (stdout: string): string => {
  const parsed: { systemMessage: string } = JSON.parse(stdout.trim());
  return parsed.systemMessage;
};

describe('code-review-graph-hook.sh', () => {
  it('理由に タブ・ESC・引用符・バックスラッシュ が混ざっても JSON として読め、exit code を含む', () => {
    const r = runHook(`printf 'bad\\ttab \\033[31mred\\033[0m "q" back\\\\slash\\n'; exit 3`, 'update');
    expect(r.status).toBe(0);
    const message = parseMessage(r.stdout);
    expect(message).toContain('exit 3');
    expect(message).toContain('"q"');
    expect(message).toContain('back\\slash');
  });

  it('失敗して出力が空でも、exit code を含む理由を出す', () => {
    const r = runHook('exit 2', 'status');
    expect(r.status).toBe(0);
    const message = parseMessage(r.stdout);
    expect(message).toContain('exit 2');
    expect(message).not.toMatch(/失敗した[:：]\s*$/);
  });

  it('内側のタイムアウトを超えたら、時間切れだと報告する', () => {
    const r = runHook('sleep 5', 'update', '1');
    expect(r.status).toBe(0);
    expect(parseMessage(r.stdout)).toContain('1秒で時間切れ');
  });

  it('成功した update は何も出さない', () => {
    const r = runHook('exit 0', 'update');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });
});
