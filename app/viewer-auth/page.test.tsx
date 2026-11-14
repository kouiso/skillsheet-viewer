import { act, fireEvent, render, screen } from '@testing-library/react';
import { TRPCClientError } from '@trpc/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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
afterEach(() => {
  vi.useRealTimers();
});

const NOT_MATCHED = 'コードが違います。共有した人に確かめてください。';
const LOCKED = 'コードの間違いが続いたため、しばらく入力できません。15分ほど待ってからお試しください。';
const NETWORK = 'つながりませんでした。もう一度お試しください';

// API が返す tRPC のエラー（code は TRPCError の code、headers は HTTP 応答のヘッダ）。
const apiError = (code: string, headers: Record<string, string> = {}) =>
  new TRPCClientError(code, {
    result: { error: { message: code, code: -32000, data: { code } } } as never,
    meta: { response: new Response(null, { headers }) },
  });

// 値を入れて送り、失敗の応答まで反映させる。
const submitCode = async (value: string) => {
  fireEvent.change(screen.getByLabelText('コード'), { target: { value } });
  await act(async () => {
    fireEvent.submit(screen.getByLabelText('コード').closest('form') as HTMLFormElement);
  });
};

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

it('コードが違う時は板 G の文言と「もう一度認証」を出し、入力は消えない', async () => {
  mutateAsync.mockRejectedValueOnce(apiError('UNAUTHORIZED'));
  render(<ViewerAuthPage />);
  await submitCode('482915');
  expect(screen.getByRole('alert')).toHaveTextContent(NOT_MATCHED);
  expect(screen.getByLabelText('コード')).toHaveValue('482915');
  expect(screen.getByLabelText('コード')).toBeEnabled();
  expect(screen.getByRole('button', { name: 'もう一度認証' })).toBeEnabled();
});

it('通信できない時は板 G の文言を出し、入力は消えない', async () => {
  mutateAsync.mockRejectedValueOnce(new TRPCClientError('Failed to fetch'));
  render(<ViewerAuthPage />);
  await submitCode('482915');
  expect(screen.getByRole('alert')).toHaveTextContent(NETWORK);
  expect(screen.getByLabelText('コード')).toHaveValue('482915');
  expect(screen.getByRole('button', { name: '認証' })).toBeEnabled();
});

it('締め出し中は、待つ必要と残りの目安を出し、入力もボタンも押せず、入力は消えず、明けたら戻る', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  mutateAsync.mockRejectedValueOnce(apiError('TOO_MANY_REQUESTS', { 'retry-after': '840' }));
  render(<ViewerAuthPage />);
  await submitCode('482915');

  expect(screen.getByRole('alert')).toHaveTextContent(LOCKED);
  expect(screen.getByLabelText('コード')).toBeDisabled();
  expect(screen.getByLabelText('コード')).toHaveValue('482915');
  expect(screen.getByRole('button', { name: 'あと 14分 で入力できます' })).toBeDisabled();

  // 押せない間は、プログラムからの送信も API へ出さない。
  await act(async () => {
    fireEvent.submit(screen.getByLabelText('コード').closest('form') as HTMLFormElement);
  });
  expect(mutateAsync).toHaveBeenCalledTimes(1);

  act(() => {
    vi.advanceTimersByTime(120_000);
  });
  expect(screen.getByRole('button', { name: 'あと 12分 で入力できます' })).toBeDisabled();

  act(() => {
    vi.advanceTimersByTime(720_000);
  });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByLabelText('コード')).toBeEnabled();
  expect(screen.getByLabelText('コード')).toHaveValue('482915');
  expect(screen.getByRole('button', { name: '認証' })).toBeEnabled();
});

it('締め出しの応答に待ち時間が無い時は、締め出しの長さ（15 分）を目安にする', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  mutateAsync.mockRejectedValueOnce(apiError('TOO_MANY_REQUESTS'));
  render(<ViewerAuthPage />);
  await submitCode('482915');
  expect(screen.getByRole('alert')).toHaveTextContent(LOCKED);
  expect(screen.getByRole('button', { name: 'あと 15分 で入力できます' })).toBeDisabled();
});
