import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fetchSkillSheet } from './github-client';

// グローバルfetchをモック
const mockFetch = vi.fn();
global.fetch = mockFetch;

// 環境変数のモック
const originalEnv = import.meta.env;

describe('github-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 環境変数をリセット
    vi.stubEnv('VITE_GITHUB_TOKEN', 'test-token');
    vi.stubEnv('VITE_GITHUB_OWNER', 'test-owner');
    vi.stubEnv('VITE_GITHUB_REPO', 'test-repo');
    vi.stubEnv('VITE_GITHUB_FILE_PATH', 'test-file.md');
    vi.stubEnv('VITE_GITHUB_BRANCH', 'main');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('fetchSkillSheet', () => {
    describe('正常系', () => {
      it('正常なレスポンスの場合、デコードされたコンテンツを返すこと', async () => {
        const content = 'テストコンテンツ';
        const base64Content = btoa(unescape(encodeURIComponent(content)));

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              content: base64Content,
              sha: 'test-sha',
              commit: {
                author: {
                  date: '2024-01-01T00:00:00Z',
                },
              },
            }),
        });

        const result = await fetchSkillSheet();

        expect(result.content).toBe(content);
        expect(result.sha).toBe('test-sha');
        expect(result.lastModified).toBe('2024-01-01T00:00:00Z');
      });

      it('日本語コンテンツを正しくデコードすること', async () => {
        const content = '# スキルシート\n\n## 自己紹介\n\n私は日本語が話せます。';
        const base64Content = btoa(unescape(encodeURIComponent(content)));

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              content: base64Content,
              sha: 'test-sha',
            }),
        });

        const result = await fetchSkillSheet();

        expect(result.content).toBe(content);
      });

      it('改行を含むBase64コンテンツを正しく処理すること', async () => {
        const content = 'テストコンテンツ';
        const base64WithNewlines = btoa(unescape(encodeURIComponent(content)))
          .match(/.{1,10}/g)
          ?.join('\n');

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              content: base64WithNewlines,
              sha: 'test-sha',
            }),
        });

        const result = await fetchSkillSheet();

        expect(result.content).toBe(content);
      });

      it('commitがない場合は現在時刻をlastModifiedに設定すること', async () => {
        const content = 'テスト';
        const base64Content = btoa(unescape(encodeURIComponent(content)));

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              content: base64Content,
              sha: 'test-sha',
            }),
        });

        const beforeCall = new Date().toISOString();
        const result = await fetchSkillSheet();
        const afterCall = new Date().toISOString();

        expect(result.lastModified >= beforeCall).toBe(true);
        expect(result.lastModified <= afterCall).toBe(true);
      });

      it('正しいURLとヘッダーでfetchを呼び出すこと', async () => {
        const content = 'テスト';
        const base64Content = btoa(unescape(encodeURIComponent(content)));

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              content: base64Content,
              sha: 'test-sha',
            }),
        });

        await fetchSkillSheet();

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.github.com/repos/test-owner/test-repo/contents/test-file.md?ref=main',
          {
            headers: {
              Authorization: 'Bearer test-token',
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'Skill-Sheet-Viewer',
            },
          },
        );
      });
    });

    describe('設定バリデーション', () => {
      it('TOKENが設定されていない場合エラーをスローすること', async () => {
        vi.stubEnv('VITE_GITHUB_TOKEN', '');

        await expect(fetchSkillSheet()).rejects.toThrow(
          'GitHub configuration is incomplete. Please set VITE_GITHUB_TOKEN, VITE_GITHUB_OWNER, and VITE_GITHUB_REPO environment variables.',
        );
      });

      it('OWNERが設定されていない場合エラーをスローすること', async () => {
        vi.stubEnv('VITE_GITHUB_OWNER', '');

        await expect(fetchSkillSheet()).rejects.toThrow(
          'GitHub configuration is incomplete. Please set VITE_GITHUB_TOKEN, VITE_GITHUB_OWNER, and VITE_GITHUB_REPO environment variables.',
        );
      });

      it('REPOが設定されていない場合エラーをスローすること', async () => {
        vi.stubEnv('VITE_GITHUB_REPO', '');

        await expect(fetchSkillSheet()).rejects.toThrow(
          'GitHub configuration is incomplete. Please set VITE_GITHUB_TOKEN, VITE_GITHUB_OWNER, and VITE_GITHUB_REPO environment variables.',
        );
      });
    });

    describe('エラーハンドリング', () => {
      it('404エラーの場合、ファイルが見つからないエラーをスローすること', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        });

        await expect(fetchSkillSheet()).rejects.toThrow(
          'File not found: test-file.md in test-owner/test-repo',
        );
      });

      it('401エラーの場合、認証エラーをスローすること', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
        });

        await expect(fetchSkillSheet()).rejects.toThrow(
          'GitHub authentication failed. Please check your VITE_GITHUB_TOKEN.',
        );
      });

      it('500エラーの場合、APIエラーをスローすること', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        });

        await expect(fetchSkillSheet()).rejects.toThrow('GitHub API error: 500 Internal Server Error');
      });

      it('403エラーの場合、APIエラーをスローすること', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
        });

        await expect(fetchSkillSheet()).rejects.toThrow('GitHub API error: 403 Forbidden');
      });
    });

    describe('デフォルト値', () => {
      it('FILE_PATHが設定されていない場合、デフォルト値を使用すること', async () => {
        vi.stubEnv('VITE_GITHUB_FILE_PATH', '');
        const content = 'テスト';
        const base64Content = btoa(unescape(encodeURIComponent(content)));

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              content: base64Content,
              sha: 'test-sha',
            }),
        });

        await fetchSkillSheet();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/contents/skillsheet.md'),
          expect.any(Object),
        );
      });

      it('BRANCHが設定されていない場合、デフォルト値を使用すること', async () => {
        vi.stubEnv('VITE_GITHUB_BRANCH', '');
        const content = 'テスト';
        const base64Content = btoa(unescape(encodeURIComponent(content)));

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              content: base64Content,
              sha: 'test-sha',
            }),
        });

        await fetchSkillSheet();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('?ref=main'),
          expect.any(Object),
        );
      });
    });
  });
});
