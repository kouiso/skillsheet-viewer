export class AuthError extends Error {
  constructor() {
    super('Not authenticated');
    this.name = 'AuthError';
  }
}

export interface SheetMeta {
  path: string;
  title: string;
  sha: string;
}

export interface SheetContent {
  content: string;
  sha: string;
  lastModified: string;
}

async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...options, credentials: 'include' });
  if (res.status === 401) throw new AuthError();
  return res;
}

export async function listSheets(): Promise<SheetMeta[]> {
  const res = await apiFetch('/api/sheets');
  if (!res.ok) throw new Error(`Failed to list sheets: ${res.status}`);
  return res.json() as Promise<SheetMeta[]>;
}

export async function fetchSheet(path: string): Promise<SheetContent> {
  const res = await apiFetch(`/api/sheets/content?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);
  return res.json() as Promise<SheetContent>;
}
