import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let dbHolder: unknown;
vi.mock('./client', () => ({ getDb: () => dbHolder }));

import { getSkillSheet, getSkillSheetById } from './skillsheet';

function selectChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'orderBy', 'limit']) chain[method] = () => chain;
  // biome-ignore lint/suspicious/noThenProperty: drizzleのawait可能なクエリを再現する
  chain.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

function fakeDb(results: unknown[][], opts: { insertedSheetId?: string; txResults?: unknown[][] } = {}) {
  let index = 0;
  let txIndex = 0;
  const values = vi.fn(() => ({
    onConflictDoNothing: vi.fn(() => ({
      returning: vi.fn().mockResolvedValue(opts.insertedSheetId ? [{ id: opts.insertedSheetId }] : []),
    })),
  }));
  const tx = {
    select: vi.fn(() => selectChain((opts.txResults ?? [])[txIndex++] ?? [])),
    insert: vi.fn(() => ({ values })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
    execute: vi.fn().mockResolvedValue(undefined),
  };
  const db = {
    select: vi.fn(() => selectChain(results[index++] ?? [])),
    insert: vi.fn(() => ({ values })),
    transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  dbHolder = db;
  return { db, tx, values };
}

const fetchMock = vi.fn<typeof fetch>();
const row = { id: 'block-1', type: 'markdown', order: 0, data: { markdown: '合成本文' } };

beforeEach(() => {
  vi.stubEnv('SKILLSHEET_OWNER_ID', 'synthetic-owner');
  for (const key of ['TOKEN', 'OWNER', 'REPO', 'FILE_PATH', 'BRANCH']) {
    vi.stubEnv(`GITHUB_${key}`, undefined);
    vi.stubEnv(`VITE_GITHUB_${key}`, undefined);
  }
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function configureSeed() {
  vi.stubEnv('GITHUB_TOKEN', 'synthetic-token');
  vi.stubEnv('GITHUB_OWNER', 'example-owner');
  vi.stubEnv('GITHUB_REPO', 'example-repo');
}

describe('シート読み込み時のGitHub seed条件', () => {
  it('既定シートがある場合は設定済みでもGitHubへアクセスしない', async () => {
    configureSeed();
    const { db } = fakeDb([[{ id: 'sheet-1' }], [{ title: '合成シート' }], [row]]);
    await expect(getSkillSheet()).resolves.toEqual({ title: '合成シート', content: '合成本文', blocks: [row] });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('既定シートのブロックが 0 件でも再 seed しない（全削除後に GitHub 本文を復活させない、S09）', async () => {
    configureSeed();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { db } = fakeDb([[{ id: 'sheet-1' }], [{ title: '合成シート' }], []]);
    await expect(getSkillSheet()).resolves.toEqual({ title: '合成シート', content: '', blocks: [] });
    expect(warn).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('シートが 1 枚も無い初回導入かつ設定済みなら既定シートを作り Markdown を保存して読む', async () => {
    configureSeed();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ content: Buffer.from('合成本文').toString('base64') })));
    // db.select: 既定なし → 最古なし → state無し（未初期化）→ fetchSheetById は title + blocks
    const { db, tx, values } = fakeDb([[], [], [], [{ title: '合成シート' }], [row]], {
      insertedSheetId: 'sheet-1',
      txResults: [[]],
    });
    await expect(getSkillSheet()).resolves.toEqual({ title: '合成シート', content: '合成本文', blocks: [row] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // skillsheet_state + skill_sheets + blocks の 3 insert
    expect(tx.insert).toHaveBeenCalledTimes(3);
    expect(values).toHaveBeenLastCalledWith([
      { sheetId: 'sheet-1', type: 'markdown', order: 0, data: { markdown: '合成本文' } },
    ]);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('シート 0 枚かつ未設定なら警告を残して空の既定シートを作る', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { tx } = fakeDb([[], [], [], [{ title: '合成シート' }], []], {
      insertedSheetId: 'sheet-1',
      txResults: [[]],
    });
    await expect(getSkillSheet()).resolves.toEqual({ title: '合成シート', content: '', blocks: [] });
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      '[skillsheet] GitHub seed is not configured (GITHUB_TOKEN/OWNER/REPO); starting with an empty sheet.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    // skillsheet_state + skill_sheets の 2 insert でブロックは挿入しない
    expect(tx.insert).toHaveBeenCalledTimes(2);
  });

  it('初期化済みでシート 0 枚なら「全削除済み」とみなし、空のまま返して初期データを復活させない（S09）', async () => {
    configureSeed();
    // db.select: 既定なし → 最古なし → state あり（初期化済み）
    const { db, tx } = fakeDb([[], [], [{ ownerId: 'synthetic-owner' }]]);
    await expect(getSkillSheet()).resolves.toEqual({ title: 'エンジニアスキルシート', content: '', blocks: [] });
    expect(fetchMock).not.toHaveBeenCalled();
    // 初期化済みなら読取は何も作らない・seed も取りにいかない
    expect(db.transaction).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('is_default が無く他シートだけ残る場合は seed せず最古シートを実効既定として読み、読取では書き込まない', async () => {
    configureSeed();
    const { db, tx } = fakeDb([[], [{ id: 'other-sheet' }], [{ title: '別シート' }], [row]]);
    await expect(getSkillSheet()).resolves.toEqual({ title: '別シート', content: '合成本文', blocks: [row] });
    expect(fetchMock).not.toHaveBeenCalled();
    // 昇格の UPDATE/INSERT は読取では発生させない（書込経路側で確定する、S09）
    expect(db.transaction).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('設定済みの取得失敗は保存せず読み込み元へ伝播する', async () => {
    configureSeed();
    fetchMock.mockResolvedValue(new Response('', { status: 403, statusText: 'Forbidden' }));
    const { db, tx } = fakeDb([[], []]);
    await expect(getSkillSheet()).rejects.toThrow('GitHub API error: 403 Forbidden');
    expect(db.insert).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('ID指定の読み込みは空シートでもGitHub seedを実行しない', async () => {
    configureSeed();
    const { db } = fakeDb([[{ title: '合成シート' }], []]);
    await expect(getSkillSheetById('sheet-1')).resolves.toEqual({ title: '合成シート', content: '', blocks: [] });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('ID指定の読み込みは別オーナー・不存在を同じ NOT_FOUND にする（S08）', async () => {
    const { SkillSheetNotFoundError } = await import('./skillsheet');
    // owner_id 一致の行が無ければ親もブロックも読まずに終了する
    fakeDb([[]]);
    await expect(getSkillSheetById('foreign-sheet')).rejects.toBeInstanceOf(SkillSheetNotFoundError);
  });
});
