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
  return /^[\w.-]+\.md$/u.test(path);
}

export async function listSheets(): Promise<SheetMeta[]> {
  const { token, owner, repo, branch } = getConfig();
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/?ref=${branch}`;

  const res = await fetch(url, { headers: githubHeaders(token) });
  if (!res.ok) throw new Error(`GitHub API error listing directory: ${res.status}`);

  const items = (await res.json()) as GitHubFileItem[];
  return items
    .filter((item) => item.type === 'file' && item.name.endsWith('.md'))
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
