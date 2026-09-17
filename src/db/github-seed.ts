/** GitHub から初期Markdownを取得するサーバー専用の経路。DBへの保存は呼び出し側が行う。 */
/**
 * GitHub からの seed（初期データ流し込み）に必要な env をまとめて取得する。
 * GITHUB_TOKEN / OWNER / REPO が全て揃っていれば型を絞った設定オブジェクトを、
 * 一つでも欠ければ null を返す。呼び出し側で env 取得を重複させないための単一窓口。
 */
export function getGitHubSeedConfig(): { token: string; owner: string; repo: string } | null {
  const token = process.env.GITHUB_TOKEN ?? process.env.VITE_GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER ?? process.env.VITE_GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO ?? process.env.VITE_GITHUB_REPO;
  if (!token || !owner || !repo) return null;
  return { token, owner, repo };
}

/**
 * GitHub からの seed が使えるだけの env が揃っているか。seed はあくまで任意の副系統
 * （正本は DB）なので、未設定は「異常」ではなく「seed をスキップして空から始める」
 * 正常系として扱う。
 */
export function isGitHubSeedConfigured(): boolean {
  return getGitHubSeedConfig() !== null;
}

/**
 * Fetch the seed markdown from the existing private GitHub repository (server-side).
 * Uses GITHUB_* env vars so the token is never exposed to the browser.
 * 呼び出し側が既に getGitHubSeedConfig() を解決済みなら config 引数で渡すことで
 * env の再読み取りを避けられる（省略時は自前で解決する＝後方互換）。
 */
export async function fetchMarkdownFromGitHub(
  config: { token: string; owner: string; repo: string } | null = getGitHubSeedConfig(),
): Promise<string> {
  if (!config) {
    throw new Error('GitHub seed source is not configured (GITHUB_TOKEN/OWNER/REPO)');
  }
  const { token, owner, repo } = config;
  const filePath = process.env.GITHUB_FILE_PATH ?? process.env.VITE_GITHUB_FILE_PATH ?? 'skillsheet.md';
  const branch = process.env.GITHUB_BRANCH ?? process.env.VITE_GITHUB_BRANCH ?? 'main';
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Skill-Sheet-Viewer',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { content?: unknown };
  if (typeof data.content !== 'string') {
    throw new Error('GitHub API response does not contain a content string (not a file?)');
  }
  return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8');
}
