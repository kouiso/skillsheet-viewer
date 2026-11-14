import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

// 履歴の 2 本を、スクリプト中で出てくる順に取り出す。
const historySql = (script: string) =>
  [...script.matchAll(/script\/sql\/((?:install-document-history|grant-e2e-history)\.sql)/g)].map((m) => m[1]);

describe('script/dev-local-stack.sh', () => {
  const local = read('script/dev-local-stack.sh');

  it('構文が正しい', () => {
    const result = spawnSync('/bin/bash', ['-n', new URL('script/dev-local-stack.sh', root).pathname], {
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
  });

  it('版の履歴の SQL 2本を、e2e-isolated-db.sh と同じ順で流す', () => {
    const e2e = historySql(read('script/e2e-isolated-db.sh'));
    expect(e2e).toEqual(['install-document-history.sql', 'grant-e2e-history.sql']);
    expect(historySql(local)).toEqual(e2e);
  });

  it('履歴の導入は、書き込み境界の後・up の中で呼ばれる', () => {
    const up = local.split('  up)\n')[1] ?? '';
    expect(up.indexOf('ensure_boundary')).toBeGreaterThan(-1);
    expect(up.indexOf('ensure_history')).toBeGreaterThan(up.indexOf('ensure_boundary'));
  });

  it('二度目の up で止まらないよう、install は関数の有無で判定する', () => {
    expect(local).toContain("p.proname='history_list'");
  });
});
