import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

import ViewerAuthPage from './page';

const { mutateAsync, push } = vi.hoisted(() => ({ mutateAsync: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/trpc-client', () => ({
  trpc: { auth: { login: { useMutation: () => ({ mutateAsync, isPending: false }) } } },
}));
vi.mock('@/lib/observability/capture', () => ({ track: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

it('画面の準備前は入力欄とボタンが押せず、ボタンに「準備しています…」と出る', () => {
  // サーバーが返す最初の HTML（effect が走る前）= 準備前の状態をそのまま見る。
  const container = document.createElement('div');
  container.innerHTML = renderToString(<ViewerAuthPage />);
  expect(container.querySelector('h1')?.textContent).toBe('スキルシートを見る');
  expect(container.querySelector('input')).toBeDisabled();
  const button = container.querySelector('button');
  expect(button).toBeDisabled();
  expect(button?.textContent).toBe('準備しています…');
});

it('準備が済むと入力でき、「認証」ボタンが押せる', () => {
  render(<ViewerAuthPage />);
  expect(screen.getByRole('heading', { name: 'スキルシートを見る' })).toBeVisible();
  expect(screen.getByText('共有されたコードを入れてください。')).toBeVisible();
  expect(screen.getByLabelText('コード')).toBeEnabled();
  expect(screen.getByLabelText('コード')).toHaveAttribute('placeholder', '000000');
  expect(screen.getByRole('button', { name: '認証' })).toBeEnabled();
});

it('背景のグラデーション・動く飾り・鍵の絵・強い影を持たない', () => {
  const { container } = render(<ViewerAuthPage />);
  expect(container.innerHTML).not.toMatch(/gradient|backdrop-blur|animate/);
  expect(container.querySelector('svg')).toBeNull();
  // カードにも画面の地にも影を付けない。ボタンは共通部品の既定が elevation を持つため、
  // 重要度付き（!）の shadow-none で打ち消している。それが外れていないことを見る。
  expect(container.querySelector('form')?.className).not.toMatch(/elevation|shadow-(?!none)/);
  expect(container.querySelector('main')?.className).not.toMatch(/elevation|shadow/);
  expect(screen.getByRole('button', { name: '認証' }).className).toMatch(/(^| )shadow-none!( |$)/);
});
