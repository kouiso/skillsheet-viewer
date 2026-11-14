import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url).pathname;

function run(...args: string[]) {
  return spawnSync('pnpm', ['exec', 'tsx', 'script/verify-607-output.ts', ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60_000,
  });
}

describe('verify-607-output の引数', () => {
  // 打ち間違い（workers 等）が何も検査せず ALL OK・終了コード0になると、未実行を成功と読んでしまう
  it.each(['workers', 'Next', ''])('未知の引数 %j は検査を始めずに終了コード1で落とす', (arg) => {
    const result = run(arg);
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain('ALL OK');
    expect(result.stdout).not.toContain('[setup]');
    expect(result.stderr).toContain('[FAILED]');
    // tsx の起動だけで 4〜5 秒かかり、並列実行では vitest 既定の 5 秒を超えて誤って落ちるため、spawnSync の上限に合わせる
  }, 60_000);
});
