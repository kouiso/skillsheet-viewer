/**
 * GitHub API client for fetching skill sheet content from private repository
 */

interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  filePath: string;
  branch: string;
}

interface SkillSheetContent {
  content: string;
  sha: string;
  lastModified: string;
}

function getGitHubConfig(): GitHubConfig {
  return {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || '',
    repo: process.env.GITHUB_REPO || '',
    filePath: process.env.GITHUB_FILE_PATH || 'skillsheet.md',
    branch: process.env.GITHUB_BRANCH || 'main',
  };
}

function validateConfig(config: GitHubConfig): void {
  if (!config.token || !config.owner || !config.repo) {
    throw new Error(
      'GitHub configuration is incomplete. Please set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO environment variables.',
    );
  }
}

function handleResponseError(response: Response, config: GitHubConfig): void {
  if (response.status === 404) {
    throw new Error(`File not found: ${config.filePath} in ${config.owner}/${config.repo}`);
  }
  if (response.status === 401) {
    throw new Error('GitHub authentication failed. Please check your GITHUB_TOKEN.');
  }
  throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
}

/**
 * Fetch skill sheet content from GitHub private repository
 */
export async function fetchSkillSheet(): Promise<SkillSheetContent> {
  const config = getGitHubConfig();
  validateConfig(config);

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.filePath}?ref=${config.branch}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Skill-Sheet-Viewer',
    },
    cache: process.env.NODE_ENV === 'production' ? 'force-cache' : 'no-store',
    next: {
      revalidate: process.env.NODE_ENV === 'production' ? 300 : 0,
    },
  });

  if (!response.ok) {
    handleResponseError(response, config);
  }

  const data = await response.json();
  const content = Buffer.from(data.content, 'base64').toString('utf-8');

  return {
    content,
    sha: data.sha,
    lastModified: data.commit?.author?.date || new Date().toISOString(),
  };
}

/**
 * Verify viewer authentication code
 */
export function verifyViewerCode(inputCode: string): boolean {
  const validCode = process.env.VIEWER_CODE;

  if (!validCode) {
    throw new Error('VIEWER_CODE environment variable is not set');
  }

  return inputCode === validCode;
}
