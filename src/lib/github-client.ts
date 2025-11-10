/**
 * GitHub API client for fetching skill sheet content from private repository
 * Client-side version
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
    token: import.meta.env.VITE_GITHUB_TOKEN || '',
    owner: import.meta.env.VITE_GITHUB_OWNER || '',
    repo: import.meta.env.VITE_GITHUB_REPO || '',
    filePath: import.meta.env.VITE_GITHUB_FILE_PATH || 'skillsheet.md',
    branch: import.meta.env.VITE_GITHUB_BRANCH || 'main',
  };
}

function validateConfig(config: GitHubConfig): void {
  if (!config.token || !config.owner || !config.repo) {
    throw new Error(
      'GitHub configuration is incomplete. Please set VITE_GITHUB_TOKEN, VITE_GITHUB_OWNER, and VITE_GITHUB_REPO environment variables.',
    );
  }
}

function handleResponseError(response: Response, config: GitHubConfig): void {
  if (response.status === 404) {
    throw new Error(`File not found: ${config.filePath} in ${config.owner}/${config.repo}`);
  }
  if (response.status === 401) {
    throw new Error('GitHub authentication failed. Please check your VITE_GITHUB_TOKEN.');
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
  });

  if (!response.ok) {
    handleResponseError(response, config);
  }

  const data = await response.json();

  // Base64 decode the content
  const decodedContent = atob(data.content.replace(/\n/g, ''));

  return {
    content: decodedContent,
    sha: data.sha,
    lastModified: data.commit?.author?.date || new Date().toISOString(),
  };
}
