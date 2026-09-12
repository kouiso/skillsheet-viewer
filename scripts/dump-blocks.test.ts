import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/db/client';
import { connectionIdentity, parseArgs, resolveSheetId, writeEvidence, writePrivateDump } from './dump-blocks';

const id = '01234567-89ab-cdef-0123-456789abcdef';
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('dump-blocks CLI', () => {
  it('単一シートの省略と明示指定を受け付ける', () => {
    expect(parseArgs(['--out', '/tmp/blocks.json'])).toEqual({ out: '/tmp/blocks.json' });
    expect(parseArgs(['--sheet-id', id, '--out', '/tmp/blocks.json'])).toEqual({
      out: '/tmp/blocks.json',
      sheetId: id,
    });
  });
  it.each([
    [],
    ['--out'],
    ['--out', ''],
    ['--out', '--sheet-id', id],
    ['--out', 'x', '--sheet-id'],
    ['--out', 'x', '--sheet-id', ''],
    ['--out', 'x', '--sheet-id', 'invalid'],
    ['--out', 'x', '--unknown', 'y'],
    ['--out', 'x', '--out', 'y'],
    ['--out', 'x', '--sheet-id', id, '--sheet-id', id],
  ])('不正な引数を拒否する: %j', (...args) => {
    expect(() => parseArgs(args as string[])).toThrow();
  });
  it('複数シートの名前やIDをエラーへ載せない', async () => {
    const from = vi.fn().mockResolvedValue([
      { id, title: 'PRIVATE NAME' },
      { id: 'other', title: 'SECRET' },
    ]);
    const db = { select: vi.fn(() => ({ from })) } as unknown as Database;
    await expect(resolveSheetId(db, undefined)).rejects.toThrow('シートが 2 枚あります。--sheet-id で指定してください');
    await expect(resolveSheetId(db, undefined)).rejects.not.toThrow(/PRIVATE|SECRET|01234567/);
  });
  it('シートが1枚の場合だけ省略で解決する', async () => {
    const db = { select: () => ({ from: async () => [{ id }] }) } as unknown as Database;
    await expect(resolveSheetId(db, undefined)).resolves.toBe(id);
  });
  it('シートが存在しない場合は空データを正常出力しない', async () => {
    const db = { select: () => ({ from: async () => [] }) } as unknown as Database;
    await expect(resolveSheetId(db, undefined)).rejects.toThrow('シートが 1 枚もありません');
    const explicitDb = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    } as unknown as Database;
    await expect(resolveSheetId(explicitDb, id)).rejects.toThrow('指定したシートが存在しません');
  });
  it('明示指定したシートを解決する', async () => {
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id }] }) }) }),
    } as unknown as Database;
    await expect(resolveSheetId(db, id)).resolves.toBe(id);
  });
  it('既存ファイルも0600にしてデータを保存する', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dump-test-'));
    dirs.push(dir);
    const path = join(dir, 'blocks.json');
    writeFileSync(path, 'old', { mode: 0o644 });
    writePrivateDump(path, [{ data: 'synthetic' }]);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual([{ data: 'synthetic' }]);
  });

  it('--evidence を受け付ける（M07 監査証跡）', () => {
    expect(parseArgs(['--out', '/tmp/blocks.json', '--sheet-id', id, '--evidence', '/tmp/ev.txt'])).toEqual({
      out: '/tmp/blocks.json',
      sheetId: id,
      evidence: '/tmp/ev.txt',
    });
  });

  it('connectionIdentity は資格情報を含めずホスト名とDB名だけ返す（M07: 接続先識別）', () => {
    const identity = connectionIdentity(
      'postgresql://user:SECRET-PASSWORD@ep-example-a1b2-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require',
    );
    expect(identity).toEqual({ endpoint: 'ep-example-a1b2-pooler.c-8.us-east-1.aws.neon.tech', database: 'neondb' });
    expect(identity.endpoint).not.toContain('SECRET');
    expect(identity.endpoint).not.toContain('user');
  });

  it('writeEvidence は非秘密の識別子だけを書き、資格情報を含めない', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dump-ev-'));
    dirs.push(dir);
    const path = join(dir, 'blocks.evidence');
    writeEvidence(path, {
      endpoint: 'ep-example.neon.tech',
      database: 'neondb',
      sheetId: id,
      ownerMatch: 'true',
      blockCount: 12,
      sha256: 'deadbeef',
    });
    const text = readFileSync(path, 'utf8');
    expect(text).toContain('owner_match=true');
    expect(text).toContain('blocks=12');
    expect(text).toContain('sha256=deadbeef');
    expect(text).not.toContain('password');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});
