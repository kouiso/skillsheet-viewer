import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const script = read('script/e2e-isolated-db.sh');
const ci = read('.github/workflows/ci.yml');
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function runScript(args: string[]) {
  return spawnSync('/bin/bash', [new URL('script/e2e-isolated-db.sh', root).pathname, ...args], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', NODE_ENV: 'test' },
  });
}
function stepBody(name: string): string {
  const body = ci.split(`      - name: ${name}\n`)[1]?.split('\n      - name:')[0];
  if (body === undefined) throw new Error(`missing step ${name}`);
  return body;
}
const stepAt = (name: string) => ci.indexOf(`      - name: ${name}\n`);

describe('script/e2e-isolated-db.sh', () => {
  it('構文が正しい', () => {
    const result = spawnSync('/bin/bash', ['-n', new URL('script/e2e-isolated-db.sh', root).pathname], {
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
  });

  it('使い方を間違えたら、何も作らずに止まる', () => {
    for (const args of [[], ['up'], ['up', 'relative/dir'], ['down'], ['down', 'relative'], ['run'], ['bogus']]) {
      const result = runScript(args);
      expect(result.status, args.join(' ')).toBe(64);
      expect(result.stderr).toContain('usage:');
    }
  });

  it('作業ディレクトリが既にあれば、上書きせずに止まる', () => {
    const existing = mkdtempSync(join(tmpdir(), 'e2e-isolated-db-test-'));
    dirs.push(existing);
    const result = runScript(['up', existing]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('作業ディレクトリは新規に作る');
    expect(existsSync(existing)).toBe(true);
  });

  it('down は存在しないディレクトリでも失敗しない（後片付けは何度呼んでもよい）', () => {
    expect(runScript(['down', join(tmpdir(), 'e2e-isolated-db-test-missing')]).status).toBe(0);
  });

  it('参照している SQL ファイルが全て存在する', () => {
    const referenced = [...script.matchAll(/script\/sql\/([\w-]+\.sql)/g)].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThanOrEqual(5);
    for (const file of referenced) expect(existsSync(new URL(`script/sql/${file}`, root)), file).toBe(true);
  });

  it('ネットワークに出ない（TCP を閉じ、Unix ソケットだけで待ち受ける）', () => {
    expect(script).toContain('-c listen_addresses=');
    expect(script).toContain('unix_socket_directories=$dir/sock');
    expect(script).not.toMatch(/listen_addresses=['"]?\*/);
    expect(script).not.toMatch(/-h\s+(localhost|127\.0\.0\.1)/);
  });

  it('接続 role はスーパーユーザーにしない', () => {
    expect(script).toMatch(/CREATE ROLE \$\{OWNER_ROLE\} LOGIN NOSUPERUSER CREATEROLE/);
  });

  it('NODE_OPTIONS は env ファイルに入れない（全ての node プロセスに効くため）', () => {
    const envFile = script.split('cat >"$dir/env" <<EOF')[1]?.split('\nEOF')[0] ?? '';
    expect(envFile).toContain('DATABASE_URL=');
    expect(envFile).toContain('ISOLATED_NEON_PROXY=');
    expect(envFile).not.toContain('NODE_OPTIONS');
  });
});

describe('ci.yml の e2e', () => {
  it('共有 DB と、それを前提にした仕組みが残っていない', () => {
    for (const gone of [
      'E2E_DATABASE_URL',
      'e2e-shared-db',
      'reset-e2e-db',
      'Reset E2E database',
      'Require dedicated E2E database',
    ]) {
      expect(ci, gone).not.toContain(gone);
    }
    expect(existsSync(new URL('script/reset-e2e-db.ts', root))).toBe(false);
  });

  it('e2e の job が使う DB の接続 URL は、隔離 DB の立ち上げが渡す値だけ', () => {
    expect(ci).not.toMatch(/DATABASE_URL:\s*\$\{\{/);
    expect(ci).not.toMatch(/secrets\.[A-Z_]*DATABASE[A-Z_]*/);
  });

  it('立ち上げは依存のインストールの後、e2e の実行の前にある', () => {
    const start = stepAt('Start isolated E2E database');
    expect(start).toBeGreaterThan(stepAt('Install dependencies'));
    for (const later of ['Install Playwright browsers', 'Playwright E2E', 'Headless browser E2E']) {
      expect(start).toBeLessThan(stepAt(later));
    }
  });

  it('後片付けは、失敗しても必ず走り、証跡の保存より後ろにある', () => {
    const stop = stepBody('Stop isolated E2E database');
    expect(stop).toContain('always()');
    expect(stop).toContain('./script/e2e-isolated-db.sh down "$RUNNER_TEMP/e2e-db"');
    expect(stepAt('Stop isolated E2E database')).toBeGreaterThan(stepAt('Upload E2E evidence'));
  });

  it('docs だけの PR では、DB の立ち上げも片付けも走らない', () => {
    for (const name of ['Start isolated E2E database', 'Stop isolated E2E database']) {
      expect(stepBody(name), name).toContain("needs.changes.outputs.docs_only != 'true'");
      expect(stepBody(name), name).toContain("matrix.check-type == 'e2e'");
    }
  });

  it('NODE_OPTIONS（隔離 DB への切り替え）は、DB に入る 2 つの step にだけ付ける', () => {
    expect(ci.match(/NODE_OPTIONS:/g)).toHaveLength(2);
    for (const name of ['Playwright E2E', 'Headless browser E2E']) {
      expect(stepBody(name), name).toMatch(
        /NODE_OPTIONS: --import \$\{\{ github\.workspace \}\}\/script\/isolated-neon-preload\.mjs/,
      );
      // 立ち上げが渡した値と食い違わせないため、上書きしない。
      expect(stepBody(name), name).not.toMatch(/^\s+DATABASE_URL:/m);
      expect(stepBody(name), name).not.toMatch(/^\s+BETTER_AUTH_SECRET:/m);
    }
  });

  it('secrets が空（fork の PR）なら、DB を立てる前に分かる形で止まる', () => {
    const body = stepBody('Start isolated E2E database');
    for (const name of ['SESSION_SECRET', 'VIEWER_CODE', 'REVALIDATE_SECRET']) {
      expect(body).toContain(`${name}: \${{ secrets.${name} }}`);
    }
    expect(body.indexOf('exit 1')).toBeLessThan(body.indexOf('./script/e2e-isolated-db.sh up'));
  });

  it('立ち上げの出力を後続の step へ渡す', () => {
    expect(stepBody('Start isolated E2E database')).toContain('cat "$RUNNER_TEMP/e2e-db/env" >> "$GITHUB_ENV"');
  });
});

describe('実行する側の関門', () => {
  it('playwright.config.ts は、.env.local を読む前に隔離 DB を確かめる', () => {
    const config = read('playwright.config.ts');
    expect(config).toContain("from './script/require-isolated-db'");
    expect(config.indexOf('assertIsolatedE2eEnv(process.env)')).toBeGreaterThan(-1);
    expect(config.indexOf('assertIsolatedE2eEnv(process.env)')).toBeLessThan(
      config.indexOf("loadEnvFile(resolve(rootDir, '.env.local'))"),
    );
    expect(config).not.toContain('E2E_DATABASE_URL');
    expect(config).not.toContain('.env.e2e');
  });

  it('headless-e2e.mjs も、起動前に同じ関門を通り、DATABASE_URL に既定値を持たない', () => {
    const headless = read('script/headless-e2e.mjs');
    expect(headless).toContain("from './require-isolated-db.mjs'");
    expect(headless.indexOf('assertIsolatedE2eEnv(process.env)')).toBeGreaterThan(-1);
    expect(headless.indexOf('assertIsolatedE2eEnv(process.env)')).toBeLessThan(
      headless.indexOf("start('pnpm', ['start']"),
    );
    expect(headless).not.toMatch(/DATABASE_URL:\s*process\.env\.DATABASE_URL\s*\?\?/);
  });

  it('libpq の環境変数を継承しない（PG_BIN だけは残す）', () => {
    expect(script).toMatch(/for pg_variable in \$\{!PG@\}/);
    expect(script).toContain('PG_BIN');
  });

  it('package.json は、隔離 DB の切り替え（preload）を打ち消さず、手元用の入口を持つ', () => {
    const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>;
    expect(scripts['test:playwright']).toMatch(/\$\{NODE_OPTIONS:-\}/);
    expect(scripts['test:playwright']).toContain('--conditions=react-server');
    expect(scripts['test:e2e:local']).toContain('./script/e2e-isolated-db.sh run');
  });
});
