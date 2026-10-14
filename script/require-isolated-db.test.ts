import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertIsolatedE2eEnv, ISOLATED_DATABASE_URL } from './require-isolated-db';

const proxy = '127.0.0.1:41234/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const good = {
  DATABASE_URL: ISOLATED_DATABASE_URL,
  ISOLATED_NEON_PROXY: proxy,
  NODE_OPTIONS: '--conditions=react-server --import /work/script/isolated-neon-preload.mjs',
} as unknown as NodeJS.ProcessEnv;

describe('assertIsolatedE2eEnv', () => {
  it('隔離 DB への向け先が揃っていれば通る', () => {
    expect(() => assertIsolatedE2eEnv(good)).not.toThrow();
  });

  it('本番・共有の DB を指す DATABASE_URL は止める', () => {
    for (const url of [
      'postgresql://owner:secret@ep-example-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require',
      'postgresql://e2e_owner@localhost:5432/postgres',
      'postgresql://e2e_owner@localhost/skillsheet_e2e',
      '',
    ]) {
      expect(() => assertIsolatedE2eEnv({ ...good, DATABASE_URL: url }), url).toThrow(/隔離 DB を指していない/);
    }
    const unset = { ...good };
    delete unset.DATABASE_URL;
    expect(() => assertIsolatedE2eEnv(unset)).toThrow(/隔離 DB を指していない/);
  });

  it('橋渡しの指定が無い、または形が違えば止める', () => {
    for (const value of [undefined, '', 'example.com:443/x', '127.0.0.1:0/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d']) {
      const env = { ...good, ISOLATED_NEON_PROXY: value } as NodeJS.ProcessEnv;
      expect(() => assertIsolatedE2eEnv(env), String(value)).toThrow(/橋渡しを指していない/);
    }
  });

  it('アプリが隔離 DB へ向かない NODE_OPTIONS は止める', () => {
    for (const value of [undefined, '', '--conditions=react-server']) {
      const env = { ...good, NODE_OPTIONS: value } as NodeJS.ProcessEnv;
      expect(() => assertIsolatedE2eEnv(env), String(value)).toThrow(/isolated-neon-preload\.mjs/);
    }
  });

  it('止める時は、動かし方を示す', () => {
    expect(() => assertIsolatedE2eEnv({} as NodeJS.ProcessEnv)).toThrow(/pnpm test:e2e:local/);
  });

  it('接続 URL の role 名は、DB を立てるスクリプトの OWNER_ROLE と同じ', () => {
    const script = readFileSync(new URL('./e2e-isolated-db.sh', import.meta.url), 'utf8');
    expect(script).toContain('OWNER_ROLE=e2e_owner');
    expect(ISOLATED_DATABASE_URL).toBe('postgresql://e2e_owner@localhost/postgres');
  });
});
