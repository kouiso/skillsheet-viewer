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

function fakeDb(results: unknown[][]) {
  let index = 0;
  const values = vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) }));
  const db = {
    select: vi.fn(() => selectChain(results[index++] ?? [])),
    insert: vi.fn(() => ({ values })),
  };
  dbHolder = db;
  return { db, values };
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
  it('既存ブロックがある場合は設定済みでもGitHubへアクセスしない', async () => {
    configureSeed();
    const { db } = fakeDb([[{ id: 'sheet-1' }], [{ id: row.id }], [{ title: '合成シート' }], [row]]);
    await expect(getSkillSheet()).resolves.toEqual({ title: '合成シート', content: '合成本文', blocks: [row] });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('空シートでも未設定なら警告を残して空のまま読む', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { db } = fakeDb([[{ id: 'sheet-1' }], [], [{ title: '合成シート' }], []]);
    await expect(getSkillSheet()).resolves.toEqual({ title: '合成シート', content: '', blocks: [] });
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      '[skillsheet] GitHub seed is not configured (GITHUB_TOKEN/OWNER/REPO); starting with an empty sheet.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('空シートかつ設定済みなら取得したMarkdownを保存して読む', async () => {
    configureSeed();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ content: Buffer.from('合成本文').toString('base64') })));
    const { values } = fakeDb([[{ id: 'sheet-1' }], [], [{ title: '合成シート' }], [row]]);
    await expect(getSkillSheet()).resolves.toEqual({ title: '合成シート', content: '合成本文', blocks: [row] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledExactlyOnceWith([
      { sheetId: 'sheet-1', type: 'markdown', order: 0, data: { markdown: '合成本文' } },
    ]);
  });

  it('設定済みの取得失敗は保存せず読み込み元へ伝播する', async () => {
    configureSeed();
    fetchMock.mockResolvedValue(new Response('', { status: 403, statusText: 'Forbidden' }));
    const { db } = fakeDb([[{ id: 'sheet-1' }], []]);
    await expect(getSkillSheet()).rejects.toThrow('GitHub API error: 403 Forbidden');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('ID指定の読み込みは空シートでもGitHub seedを実行しない', async () => {
    configureSeed();
    const { db } = fakeDb([[{ title: '合成シート' }], []]);
    await expect(getSkillSheetById('sheet-1')).resolves.toEqual({ title: '合成シート', content: '', blocks: [] });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});
