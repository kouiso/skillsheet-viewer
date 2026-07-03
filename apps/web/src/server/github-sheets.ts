import { Buffer } from 'node:buffer';

export interface SheetMeta {
  path: string;
  title: string;
  sha: string;
}

export interface SheetContent {
  content: string;
  sha: string;
  lastModified: string;
  title: string;
}

interface GitHubFileItem {
  name: string;
  path: string;
  sha: string;
  type: string;
}

interface GitHubFileContent {
  content: string;
  sha: string;
}

/** GitHub 上に対象ファイルが存在しない（404）ことを表す。システムエラーと区別するために使う。 */
export class SheetNotFoundError extends Error {
  constructor(path: string) {
    super(`Sheet not found: ${path}`);
    this.name = 'SheetNotFoundError';
  }
}

function getConfig() {
  const token = process.env.GITHUB_TOKEN ?? process.env.VITE_GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER ?? process.env.VITE_GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO ?? process.env.VITE_GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH ?? process.env.VITE_GITHUB_BRANCH ?? 'main';

  if (!token || !owner || !repo) {
    throw new Error('Missing required GitHub env vars: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO');
  }

  return { token, owner, repo, branch };
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Skill-Sheet-Viewer',
  };
}

function decodeBase64Content(base64: string): string {
  return Buffer.from(base64.replace(/\n/g, ''), 'base64').toString('utf-8');
}

export function isValidSheetPath(path: string): boolean {
  if (path.includes('..') || path.startsWith('/') || path.includes('\0')) return false;
  // \w は /u でも ASCII 限定のため、Unicode 文字プロパティで日本語ファイル名（例: 技術スキルシート.md）も許容する。
  // ディレクトリ区切り（/）は許可しないので、フラットな .md ファイル名のみが通る。
  return /^[\p{L}\p{N}_.-]+\.md$/u.test(path);
}

/**
 * スキルシートとして一覧・表示しない Markdown ファイル名（リポジトリ設定 / AI 指示系）。
 * データ源リポジトリのルートに混在しても閲覧側には出さない。比較は小文字で行う。
 */
const NON_SHEET_MARKDOWN: ReadonlySet<string> = new Set([
  'readme.md',
  'claude.md',
  'agents.md',
  'gemini.md',
  'copilot.md',
  'copilot-instructions.md',
  'contributing.md',
  'code_of_conduct.md',
  'security.md',
  'changelog.md',
  'license.md',
  'support.md',
  'governance.md',
  'maintainers.md',
  'authors.md',
  'notice.md',
  'history.md',
  'todo.md',
]);

/** ファイル名がスキルシートとして扱える .md か（設定 / AI 指示系・ドットファイルは除外）。 */
export function isSheetFileName(name: string): boolean {
  if (!name.endsWith('.md')) return false;
  if (name.startsWith('.')) return false;
  return !NON_SHEET_MARKDOWN.has(name.toLowerCase());
}

export async function listSheets(): Promise<SheetMeta[]> {
  const { token, owner, repo, branch } = getConfig();
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/?ref=${branch}`;

  const res = await fetch(url, { headers: githubHeaders(token) });
  if (!res.ok) throw new Error(`GitHub API error listing directory: ${res.status}`);

  const items = (await res.json()) as GitHubFileItem[];
  return items
    .filter((item) => item.type === 'file' && isSheetFileName(item.name))
    .map((item) => ({
      path: item.path,
      title: item.name.replace(/\.md$/u, ''),
      sha: item.sha,
    }));
}

export async function fetchSheetFile(path: string): Promise<SheetContent> {
  const { token, owner, repo, branch } = getConfig();
  const encodedPath = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${branch}`;

  const res = await fetch(url, { headers: githubHeaders(token) });
  if (res.status === 404) throw new SheetNotFoundError(path);
  if (!res.ok) throw new Error(`GitHub API error fetching file: ${res.status}`);

  const data = (await res.json()) as GitHubFileContent;
  const content = decodeBase64Content(data.content);
  const firstHeading = content.match(/^#\s+(.+)$/m);
  const title = firstHeading ? firstHeading[1].trim() : path.replace(/\.md$/u, '');

  return {
    content,
    sha: data.sha,
    lastModified: new Date().toISOString(),
    title,
  };
}
