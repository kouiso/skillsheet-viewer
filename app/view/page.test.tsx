import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireViewer: vi.fn<() => Promise<void>>(),
  createServerCaller: vi.fn(),
}));

/** next/navigation の redirect() と同じく、例外を投げて描画を打ち切る挙動を模す。 */
class RedirectError extends Error {}

vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('@/server/viewer-gate', () => ({ requireViewer: mocks.requireViewer }));
vi.mock('@/server/trpc/caller', () => ({ createServerCaller: mocks.createServerCaller }));
// 一覧本体はクライアント側で別途テスト済み。ここは page が「呼ぶ / 呼ばない」だけを見る。
vi.mock('./db-sheets-list-client', () => ({ default: () => null }));

import SheetsListPage from './page';

const sheets = [{ id: 's1', title: 'テストシート', updatedAt: new Date('2026-01-01T00:00:00.000Z') }];

const callerReturning = () => ({
  auth: { status: async () => ({ canEdit: false, canView: true }) },
  sheet: { list: async () => ({ sheets, stale: false }) },
});

describe('SheetsListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerCaller.mockResolvedValue(callerReturning());
  });

  // App Router は layout と page を並行して描くため、layout の requireViewer() が
  // リダイレクトを投げても page のデータ取得は走る。ガードが無いと viewerProcedure が
  // UNAUTHORIZED を投げ、未認証アクセスのたびにエラーログが出ていた。
  // page 自身がリダイレクトするのは、クライアント遷移で共有 layout が再描画されず、
  // 遷移の間に閲覧 cookie が切れた場合に layout 側の判定が走らないため。
  it('未認可なら caller を呼ばずにリダイレクトへ抜ける', async () => {
    mocks.requireViewer.mockRejectedValue(new RedirectError('redirect'));

    await expect(SheetsListPage()).rejects.toBeInstanceOf(RedirectError);
    expect(mocks.createServerCaller).not.toHaveBeenCalled();
  });

  it('認可済みなら従来どおり一覧を取得して描画する', async () => {
    mocks.requireViewer.mockResolvedValue(undefined);

    const element = (await SheetsListPage()) as ReactElement<{ initialSheets: typeof sheets }>;

    expect(mocks.createServerCaller).toHaveBeenCalled();
    expect(element).not.toBeNull();
    expect(element.props.initialSheets).toEqual(sheets);
  });
});
