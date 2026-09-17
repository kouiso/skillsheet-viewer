import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/db/client';
import { connectionIdentity, parseArgs, readDumpSnapshot, writeEvidence, writePrivateDump } from './dump-block';

vi.mock('../src/db/document-service', () => ({ createDocumentService: vi.fn() }));

import { createDocumentService } from '../src/db/document-service';

const service = { list: vi.fn(), read: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createDocumentService).mockReturnValue(service as never);
});

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
    service.list.mockResolvedValue([
      { sheetId: id, title: 'PRIVATE NAME' },
      { sheetId: 'other', title: 'SECRET' },
    ]);
    await expect(readDumpSnapshot({} as Database, undefined, 'owner')).rejects.toThrow(
      'シートが 2 枚あります。--sheet-id で指定してください',
    );
    expect(service.read).not.toHaveBeenCalled();
  });
  it('シートが1枚の場合だけ省略で解決し本文と版を同時取得する', async () => {
    service.list.mockResolvedValue([{ sheetId: id }]);
    service.read.mockResolvedValue({
      status: 'OK',
      snapshot: { sheetId: id, revision: '9007199254740993', blocks: [] },
    });
    expect(await readDumpSnapshot({} as Database, undefined, 'owner')).toMatchObject({
      sheetId: id,
      revision: '9007199254740993',
    });
    expect(service.read).toHaveBeenCalledWith(id);
    expect(service.read).toHaveBeenCalledTimes(1);
  });
  it('シートが存在しない場合は空データを正常出力しない', async () => {
    service.list.mockResolvedValue([]);
    await expect(readDumpSnapshot({} as Database, undefined, 'owner')).rejects.toThrow('シートが 1 枚もありません');
    service.read.mockResolvedValue({ status: 'NOT_FOUND' });
    await expect(readDumpSnapshot({} as Database, id, 'owner')).rejects.toThrow('指定したシートが存在しない');
  });
  it('明示IDでは一覧や基表を読まず、期待owner付きsnapshotだけを取得する', async () => {
    const snapshot = { sheetId: id, revision: '0', blocks: [{ type: 'future', data: { keep: null } }] };
    service.read.mockResolvedValue({ status: 'OK', snapshot });
    expect(await readDumpSnapshot({} as Database, id, 'owner')).toBe(snapshot);
    expect(createDocumentService).toHaveBeenCalledWith({}, 'owner');
    expect(service.list).not.toHaveBeenCalled();
    expect(service.read).toHaveBeenCalledTimes(1);
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
      revision: '9007199254740993',
      blockCount: 12,
      sha256: 'deadbeef',
    });
    const text = readFileSync(path, 'utf8');
    expect(text).toContain('owner_match=true');
    expect(text).toContain('blocks=12');
    expect(text).toContain('revision=9007199254740993');
    expect(text).toContain('sha256=deadbeef');
    expect(text).not.toContain('password');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});
