import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchMarkdownFromGitHub, getGitHubSeedConfig, isGitHubSeedConfigured } from './skillsheet';

const config = { token: 'synthetic-token', owner: 'example-owner', repo: 'example-repo' };
const keys = ['TOKEN', 'OWNER', 'REPO', 'FILE_PATH', 'BRANCH'];
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  for (const key of keys) {
    vi.stubEnv(`GITHUB_${key}`, undefined);
    vi.stubEnv(`VITE_GITHUB_${key}`, undefined);
  }
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('GitHub seed の環境設定', () => {
  it('未設定なら取得せず、既存のエラーを返す', async () => {
    expect(getGitHubSeedConfig()).toBeNull();
    expect(isGitHubSeedConfigured()).toBe(false);
    await expect(fetchMarkdownFromGitHub()).rejects.toThrow(
      'GitHub seed source is not configured (GITHUB_TOKEN/OWNER/REPO)',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('GITHUB_* を優先し、未定義の項目だけ VITE_* を使う', () => {
    vi.stubEnv('GITHUB_TOKEN', 'primary-token');
    vi.stubEnv('VITE_GITHUB_TOKEN', 'fallback-token');
    vi.stubEnv('VITE_GITHUB_OWNER', 'fallback-owner');
    vi.stubEnv('GITHUB_REPO', 'primary-repo');
    vi.stubEnv('VITE_GITHUB_REPO', 'fallback-repo');
    expect(getGitHubSeedConfig()).toEqual({
      token: 'primary-token',
      owner: 'fallback-owner',
      repo: 'primary-repo',
    });
  });

  it('空の GITHUB_TOKEN は VITE 側へフォールバックしない', () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    vi.stubEnv('VITE_GITHUB_TOKEN', config.token);
    vi.stubEnv('GITHUB_OWNER', config.owner);
    vi.stubEnv('GITHUB_REPO', config.repo);
    expect(getGitHubSeedConfig()).toBeNull();
  });
});

describe('GitHub seed の取得', () => {
  it('既定URLとヘッダーで取得し、改行入りbase64を日本語に戻す', async () => {
    const markdown = '# 合成シート\n本文です。\n';
    const encoded = Buffer.from(markdown).toString('base64');
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ content: `${encoded.slice(0, 8)}\n${encoded.slice(8)}\n` })),
    );
    await expect(fetchMarkdownFromGitHub(config)).resolves.toBe(markdown);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'https://api.github.com/repos/example-owner/example-repo/contents/skillsheet.md?ref=main',
      {
        headers: {
          Authorization: 'Bearer synthetic-token',
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Skill-Sheet-Viewer',
        },
      },
    );
  });

  it('引数省略時は環境設定を読み、パスとブランチもGITHUB側を優先する', async () => {
    vi.stubEnv('GITHUB_TOKEN', config.token);
    vi.stubEnv('GITHUB_OWNER', config.owner);
    vi.stubEnv('GITHUB_REPO', config.repo);
    vi.stubEnv('GITHUB_FILE_PATH', 'draft/sheet.md');
    vi.stubEnv('VITE_GITHUB_FILE_PATH', 'old.md');
    vi.stubEnv('GITHUB_BRANCH', 'draft-branch');
    vi.stubEnv('VITE_GITHUB_BRANCH', 'old-branch');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ content: '' })));
    await expect(fetchMarkdownFromGitHub()).resolves.toBe('');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/example-owner/example-repo/contents/draft/sheet.md?ref=draft-branch',
    );
  });

  it('パスとブランチが未定義ならVITE側を使う', async () => {
    vi.stubEnv('VITE_GITHUB_FILE_PATH', 'fallback.md');
    vi.stubEnv('VITE_GITHUB_BRANCH', 'fallback');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ content: '' })));
    await fetchMarkdownFromGitHub(config);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/example-owner/example-repo/contents/fallback.md?ref=fallback',
    );
  });

  it('空のパスとブランチも既定値に置き換えない', async () => {
    vi.stubEnv('GITHUB_FILE_PATH', '');
    vi.stubEnv('GITHUB_BRANCH', '');
    vi.stubEnv('VITE_GITHUB_FILE_PATH', 'fallback.md');
    vi.stubEnv('VITE_GITHUB_BRANCH', 'fallback');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ content: '' })));
    await fetchMarkdownFromGitHub(config);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/example-owner/example-repo/contents/?ref=');
  });

  it('明示的なnullは環境設定へフォールバックしない', async () => {
    vi.stubEnv('GITHUB_TOKEN', config.token);
    vi.stubEnv('GITHUB_OWNER', config.owner);
    vi.stubEnv('GITHUB_REPO', config.repo);
    await expect(fetchMarkdownFromGitHub(null)).rejects.toThrow('GitHub seed source is not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('HTTP失敗はステータスを含む既存の例外を返す', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 404, statusText: 'Not Found' }));
    await expect(fetchMarkdownFromGitHub(config)).rejects.toThrow('GitHub API error: 404 Not Found');
  });

  it.each([{}, { content: 42 }, [], { content: null }])('contentが文字列でない応答を拒否する (%j)', async (body) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body)));
    await expect(fetchMarkdownFromGitHub(config)).rejects.toThrow(
      'GitHub API response does not contain a content string (not a file?)',
    );
  });

  it('JSONがnullのときも現行のTypeErrorを維持する', async () => {
    fetchMock.mockResolvedValue(new Response('null'));
    await expect(fetchMarkdownFromGitHub(config)).rejects.toBeInstanceOf(TypeError);
  });

  it('ネットワーク例外を変換しない', async () => {
    const error = new Error('synthetic network failure');
    fetchMock.mockRejectedValue(error);
    await expect(fetchMarkdownFromGitHub(config)).rejects.toBe(error);
  });

  it('不正JSONの構文エラーを変換しない', async () => {
    fetchMock.mockResolvedValue(new Response('not json'));
    await expect(fetchMarkdownFromGitHub(config)).rejects.toBeInstanceOf(SyntaxError);
  });
});
