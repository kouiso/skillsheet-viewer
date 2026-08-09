import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthStatusQuery = vi.fn();

vi.mock('@/lib/trpc-client', () => ({
  trpc: { auth: { status: { useQuery: useAuthStatusQuery } } },
}));

vi.mock('./sheet-view-client', () => ({
  default: ({
    title,
    content,
    canEdit,
    reserveEditSlot,
  }: {
    title: string;
    content: string;
    canEdit: boolean;
    reserveEditSlot: boolean;
  }) => (
    <article data-can-edit={String(canEdit)} data-reserve-edit-slot={String(reserveEditSlot)}>
      <h1>{title}</h1>
      <p>{content}</p>
    </article>
  ),
}));

import DeferredEditSheetView from './deferred-edit-sheet-view';

describe('DeferredEditSheetView', () => {
  beforeEach(() => {
    useAuthStatusQuery.mockReset();
  });

  it('編集者判定の待機中でも本文を表示し、編集導線は出さない', () => {
    useAuthStatusQuery.mockReturnValue({ data: undefined });
    render(<DeferredEditSheetView title="T" content="本文" />);
    expect(screen.getByRole('heading', { name: 'T' })).toBeInTheDocument();
    expect(screen.getByText('本文').closest('article')).toHaveAttribute('data-can-edit', 'false');
    expect(screen.getByText('本文').closest('article')).toHaveAttribute('data-reserve-edit-slot', 'true');
  });

  it('編集者判定の失敗時も本文を表示し、編集導線は出さない', () => {
    useAuthStatusQuery.mockReturnValue({ data: undefined, error: new Error('db down') });
    render(<DeferredEditSheetView title="T" content="本文" />);
    expect(screen.getByText('本文').closest('article')).toHaveAttribute('data-can-edit', 'false');
  });

  it('編集者判定の成功後は編集導線を有効にする', () => {
    useAuthStatusQuery.mockReturnValue({ data: { canEdit: true, canView: true } });
    render(<DeferredEditSheetView title="T" content="本文" />);
    expect(screen.getByText('本文').closest('article')).toHaveAttribute('data-can-edit', 'true');
  });
});
