import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ owner: 'owner-a', read: vi.fn() }));
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>) => {
    const values = new Map<string, Promise<unknown>>();
    return (...args: unknown[]) => {
      const key = JSON.stringify(args);
      if (!values.has(key)) values.set(key, fn(...args));
      return values.get(key);
    };
  },
}));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/db/skillsheet', () => ({
  getOwnerId: () => state.owner,
  SkillSheetNotFoundError: class extends Error {},
}));
vi.mock('./document-view', () => ({
  readViewerDocument: (_db: unknown, owner: string, id: string | null, referenceMonth: number) => {
    state.read(owner, id, referenceMonth);
    return Promise.resolve({ title: `${owner}:${id}`, content: '', blocks: [], revision: '0', referenceMonth });
  },
  readViewerList: (_db: unknown, owner: string) =>
    Promise.resolve([{ id: owner, title: owner, updatedAt: new Date() }]),
}));

import { getCachedDbSheet, getCachedDbSheetById, getCachedDbSheets } from './sheet-cache';

describe('owner-scoped viewer caches', () => {
  it('separates identical document IDs, defaults and navigation across owners', async () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    state.owner = 'owner-a';
    expect((await getCachedDbSheetById(id)).title).toBe(`owner-a:${id}`);
    expect((await getCachedDbSheet()).title).toBe('owner-a:null');
    expect((await getCachedDbSheets()).sheets[0].id).toBe('owner-a');
    state.owner = 'owner-b';
    expect((await getCachedDbSheetById(id)).title).toBe(`owner-b:${id}`);
    expect((await getCachedDbSheet()).title).toBe('owner-b:null');
    expect((await getCachedDbSheets()).sheets[0].id).toBe('owner-b');
    state.owner = 'owner-a';
    expect((await getCachedDbSheetById(id)).title).toBe(`owner-a:${id}`);
    expect(state.read).toHaveBeenCalledTimes(4);
  });
});

it('日本の月替わりでキャッシュを分離し、その月を出力へ保持する', async () => {
  vi.useFakeTimers();
  state.owner = 'owner-month-test';
  state.read.mockClear();
  try {
    vi.setSystemTime(new Date('2026-08-31T14:59:59Z'));
    expect((await getCachedDbSheet()).referenceMonth).toBe(2026 * 12 + 7);
    expect((await getCachedDbSheet()).referenceMonth).toBe(2026 * 12 + 7);
    vi.setSystemTime(new Date('2026-08-31T15:00:00Z'));
    expect((await getCachedDbSheet()).referenceMonth).toBe(2026 * 12 + 8);
    expect(state.read).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});
