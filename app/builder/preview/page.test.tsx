import { beforeEach, describe, expect, it, vi } from 'vitest';

const { status, redirect } = vi.hoisted(() => ({
  status: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(url);
  }),
}));
vi.mock('next/server', () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/server/trpc/caller', () => ({ createServerCaller: async () => ({ auth: { status } }) }));

import BuilderPreviewPage from './page';

describe('プレビューのログイン復帰先', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    status.mockResolvedValue({ canEdit: false });
  });
  it('sessionだけをencodeし、固定のプレビューURLへ戻す', async () => {
    const session = '合成 &next=https://example.invalid/#fragment';
    const next = `/builder/preview?${new URLSearchParams({ session })}`;
    await expect(BuilderPreviewPage({ searchParams: Promise.resolve({ session }) })).rejects.toThrow(
      `/login?next=${encodeURIComponent(next)}`,
    );
    const called = redirect.mock.calls[0][0];
    const restored = new URL(called, 'https://example.test').searchParams.get('next');
    expect(restored).toBe(next);
    expect(new URL(restored ?? '', 'https://example.test').pathname).toBe('/builder/preview');
  });
  it('複数値のsessionを曖昧に引き継がない', async () => {
    await expect(BuilderPreviewPage({ searchParams: Promise.resolve({ session: ['a', 'b'] }) })).rejects.toThrow(
      '/login?next=%2Fbuilder%2Fpreview',
    );
  });
  it('認可済みならセッション付きページを表示する', async () => {
    status.mockResolvedValue({ canEdit: true });
    const result = await BuilderPreviewPage({ searchParams: Promise.resolve({ session: 'fixture-a' }) });
    expect(result).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});
