/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VIEWER_CODE: string;
  readonly VITE_GITHUB_TOKEN: string;
  readonly VITE_GITHUB_OWNER: string;
  readonly VITE_GITHUB_REPO: string;
  readonly VITE_GITHUB_FILE_PATH: string;
  readonly VITE_GITHUB_BRANCH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
