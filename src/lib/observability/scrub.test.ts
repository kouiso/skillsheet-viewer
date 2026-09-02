import { describe, expect, it } from 'vitest';

import { redactFreeText, scrubBreadcrumb, scrubSentryEvent, toRouteName } from './scrub';

describe('toRouteName', () => {
  it.each([
    ['/', 'home'],
    ['/view', 'view-index'],
    ['/view/', 'view-index'],
    ['/view/技術スキルシート.md', 'view-sheet'],
    ['/view/db', 'view-db-index'],
    ['/view/db/abcd1234', 'view-db-sheet'],
    ['/viewer-auth', 'viewer-auth'],
    ['/login', 'login'],
    ['/builder', 'builder'],
    ['/builder/preview', 'builder-preview'],
    ['/api/auth/callback/google', 'api-auth'],
    ['/api/logout', 'api-logout'],
    ['/api/revalidate', 'api-revalidate'],
    ['/api/trpc/auth.login', 'api-trpc'],
    ['/some/unknown/path', 'other'],
    ['not a url at all ///', 'other'],
  ] as const)('%s → %s', (input, expected) => {
    expect(toRouteName(input)).toBe(expected);
  });

  it('絶対 URL でも pathname を見て判定する', () => {
    expect(toRouteName('https://example.com/view/機密案件.md?x=1')).toBe('view-sheet');
  });
});

describe('redactFreeText', () => {
  it('.md ファイル名を潰す', () => {
    expect(redactFreeText('Failed to load sheet: 技術スキルシート.md')).toBe('Failed to load sheet: [redacted.md]');
  });

  it('UUID を潰す', () => {
    expect(redactFreeText('id=550e8400-e29b-41d4-a716-446655440000')).toBe('id=[redacted-uuid]');
  });

  it('メールアドレスを潰す', () => {
    expect(redactFreeText('contact kouiso@ritmo.co.jp for access')).toBe('contact [redacted-email] for access');
  });

  it('32文字以上の英数トークンを潰す', () => {
    const token = 'a'.repeat(40);
    expect(redactFreeText(`token=${token}`)).toBe('token=[redacted-token]');
  });

  it('300字を超えたら切り詰める', () => {
    // 英数字だと LONG_TOKEN_PATTERN に丸ごと食われて短くなってしまうため、
    // 他のパターンに一切マッチしない文字（日本語の繰り返し）で長さだけを検証する。
    const long = 'あ'.repeat(400);
    const result = redactFreeText(long);
    expect(result.length).toBeLessThanOrEqual(301);
    expect(result.endsWith('…')).toBe(true);
  });

  it('該当しない文字列はそのまま', () => {
    expect(redactFreeText('plain error message')).toBe('plain error message');
  });
});

describe('scrubBreadcrumb', () => {
  it('history breadcrumb の to/from をルート名に丸める（罠4）', () => {
    const result = scrubBreadcrumb({
      category: 'navigation',
      data: { to: '/view/技術スキルシート.md', from: '/view' },
    });
    expect(result.data?.to).toBe('/[route:view-sheet]');
    expect(result.data?.from).toBe('/[route:view-index]');
  });

  it('http breadcrumb の url を GitHub のファイルパスごと丸める（罠3の二重化）', () => {
    const result = scrubBreadcrumb({
      category: 'http',
      data: { url: 'https://api.github.com/repos/kouiso/private/contents/技術スキルシート.md?ref=main' },
    });
    expect(result.data?.url).toBe('/[route:other]');
  });

  it('message も redactFreeText を通す', () => {
    const result = scrubBreadcrumb({ category: 'console', message: 'Failed to load sheet: 案件A社.md' });
    expect(result.message).toBe('Failed to load sheet: [redacted.md]');
  });

  it('元のオブジェクトを変更しない', () => {
    const original = { category: 'navigation', data: { to: '/view/x.md' } };
    scrubBreadcrumb(original);
    expect(original.data.to).toBe('/view/x.md');
  });
});

describe('scrubSentryEvent', () => {
  it('request.url をルート名に丸め、query/cookie/header を落とす（罠1の防御深化）', () => {
    const result = scrubSentryEvent({
      request: {
        url: 'https://skillsheet.example/view/技術スキルシート.md?foo=bar',
        query_string: 'foo=bar',
        cookies: 'session=abc',
        headers: { cookie: 'session=abc' },
      },
    });
    expect(result.request?.url).toBe('/[route:view-sheet]');
    expect(result.request?.query_string).toBeUndefined();
    expect(result.request?.cookies).toBeUndefined();
    expect(result.request?.headers).toBeUndefined();
  });

  it('contexts.nextjs.request_path をルート名に丸める（罠1: raw path + query string 対策）', () => {
    const result = scrubSentryEvent({
      contexts: { nextjs: { request_path: '/view/技術スキルシート.md?token=abc' } },
    });
    expect(result.contexts?.nextjs?.request_path).toBe('/[route:view-sheet]');
  });

  it('exception.values[].value を redactFreeText する', () => {
    const result = scrubSentryEvent({
      exception: { values: [{ type: 'Error', value: 'Failed to load sheet: 技術スキルシート.md' }] },
    });
    expect(result.exception?.values?.[0].value).toBe('Failed to load sheet: [redacted.md]');
  });

  it('user は常に落とす（setUser を呼んでいなくても防御）', () => {
    const result = scrubSentryEvent({ user: { id: 'abc', email: 'kouiso@ritmo.co.jp' } });
    expect(result.user).toBeUndefined();
  });

  it('breadcrumbs も丸ごと scrub する', () => {
    const result = scrubSentryEvent({
      breadcrumbs: [{ category: 'navigation', data: { to: '/view/x.md' } }],
    });
    expect(result.breadcrumbs?.[0].data?.to).toBe('/[route:view-sheet]');
  });

  it('該当フィールドが無いイベントはそのまま通す', () => {
    const result = scrubSentryEvent({ message: 'plain' });
    expect(result.message).toBe('plain');
  });
});
