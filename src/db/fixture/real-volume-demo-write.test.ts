import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const service = { read: vi.fn(), replace: vi.fn(), create: vi.fn() };
  const tx = { execute: vi.fn(), select: vi.fn(), insert: vi.fn() };
  return { service, tx, existing: [] as { sheetId: string }[] };
});
vi.mock('../client', () => ({ getDb: () => ({ transaction: (fn: (tx: unknown) => unknown) => fn(mocks.tx) }) }));
vi.mock('../skillsheet', () => ({ getOwnerId: () => 'fixture-owner' }));
vi.mock('../document-service', async (original) => ({
  ...(await original<typeof import('../document-service')>()),
  createDocumentService: vi.fn(() => mocks.service),
}));

import { createRealVolumeDemoSheet } from './real-volume-demo';

const sheetId = '00000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.existing = [];
  mocks.tx.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => mocks.existing }) }) });
  mocks.tx.insert.mockReturnValue({ values: () => ({ onConflictDoNothing: async () => undefined }) });
  mocks.service.read.mockResolvedValue({ status: 'OK', snapshot: { revision: '9007199254740993' } });
  mocks.service.replace.mockResolvedValue({});
  mocks.service.create.mockResolvedValue({});
});

describe('実ボリュームfixtureの文書サービス境界', () => {
  it('既存fixtureはsnapshotの文字列版で更新する', async () => {
    mocks.existing = [{ sheetId }];
    expect(await createRealVolumeDemoSheet()).toBe(sheetId);
    expect(mocks.service.read).toHaveBeenCalledWith(sheetId);
    expect(mocks.service.replace).toHaveBeenCalledWith(
      sheetId,
      '9007199254740993',
      expect.any(String),
      expect.any(Array),
    );
    expect(mocks.service.create).not.toHaveBeenCalled();
    expect(mocks.tx.insert).not.toHaveBeenCalled();
  });

  it('CAS競合を握り潰したり再作成したりしない', async () => {
    mocks.existing = [{ sheetId }];
    mocks.service.replace.mockRejectedValueOnce(new Error('CONFLICT'));
    await expect(createRealVolumeDemoSheet()).rejects.toThrow('CONFLICT');
    expect(mocks.service.create).not.toHaveBeenCalled();
  });

  it('新規fixtureはUUID付きブロックを限定createへ渡す', async () => {
    const id = await createRealVolumeDemoSheet();
    const [createdId, , blocks] = mocks.service.create.mock.calls[0];
    expect(createdId).toBe(id);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(blocks.length).toBeGreaterThan(0);
    expect(new Set(blocks.map((block: { id: string }) => block.id)).size).toBe(blocks.length);
    expect(mocks.tx.insert).toHaveBeenCalledOnce();
  });
});
