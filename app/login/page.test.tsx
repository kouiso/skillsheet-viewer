import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import LoginPage from './page';

const { emailSignIn, push } = vi.hoisted(() => ({ emailSignIn: vi.fn(), push: vi.fn() }));
vi.mock('@/lib/auth-client', () => ({ signIn: { email: emailSignIn } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams('next=/builder'),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

async function submit() {
  const user = userEvent.setup();
  render(<LoginPage />);
  expect(screen.getByRole('heading', { name: '編集者ログイン' })).toBeVisible();
  expect(screen.getByRole('link', { name: '閲覧コード認証へ' })).toHaveAttribute('href', '/viewer-auth');
  await user.type(screen.getByLabelText('メールアドレス'), 'editor@example.com');
  await user.type(screen.getByLabelText('パスワード'), 'test-password');
  await user.click(screen.getByRole('button', { name: 'ログイン' }));
}

it('入力した認証情報でログインし編集画面へ進む', async () => {
  emailSignIn.mockResolvedValue({ data: {}, error: null });
  await submit();
  await waitFor(() => expect(push).toHaveBeenCalledWith('/builder'));
  expect(emailSignIn).toHaveBeenCalledWith({ email: 'editor@example.com', password: 'test-password' });
});

it('認証失敗を表示し再入力できる', async () => {
  emailSignIn.mockResolvedValue({ error: { message: 'invalid' } });
  await submit();
  expect(await screen.findByRole('alert')).toHaveTextContent('メールアドレスまたはパスワードが正しくありません');
  expect(screen.getByRole('button', { name: 'ログイン' })).toBeEnabled();
  expect(push).not.toHaveBeenCalled();
});

it('通信失敗を表示し再試行できる', async () => {
  emailSignIn.mockRejectedValue(new Error('network'));
  await submit();
  expect(await screen.findByRole('alert')).toHaveTextContent('ログインに失敗しました');
  expect(screen.getByRole('button', { name: 'ログイン' })).toBeEnabled();
});

it('認証の応答を待つ間は再送信を防ぐ', async () => {
  let finish: (value: { data: object; error: null }) => void = () => {};
  emailSignIn.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await submit();
  expect(screen.getByRole('button', { name: 'ログイン中...' })).toBeDisabled();
  expect(emailSignIn).toHaveBeenCalledTimes(1);
  finish({ data: {}, error: null });
  await waitFor(() => expect(push).toHaveBeenCalledWith('/builder'));
});

it('OAuthの続きへ進む場合は通常の編集画面へ遷移しない', async () => {
  const assign = vi.fn();
  const originalWindow = window;
  vi.stubGlobal(
    'window',
    new Proxy(originalWindow, {
      get(target, key) {
        return key === 'location' ? { assign } : Reflect.get(target, key, target);
      },
    }),
  );
  try {
    emailSignIn.mockResolvedValue({ data: { url: '/consent?oauth_query=test' }, error: null });
    await submit();
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/consent?oauth_query=test'));
    expect(push).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
