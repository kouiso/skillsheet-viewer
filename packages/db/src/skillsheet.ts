/**
 * Server-side skill sheet read path (NeonDB is the source of truth).
 *
 * Ported from the previous Vercel Function (`api/skillsheet.ts`) with no
 * behavior change: read ordered blocks from the DB, and on first request seed
 * them from the existing GitHub markdown source if the sheet is empty.
 *
 * Server-only. Never import this from a Client Component.
 */
import { asc, eq } from 'drizzle-orm';

import { type Block, blocksToMarkdown, splitMarkdownIntoBlocks } from './blocks';
import { type Database, getDb } from './client';
import { blocks, skillSheets } from './schema';

const OWNER_ID = 'kouiso';
const TITLE = 'エンジニアスキルシート';

export interface SkillSheet {
  title: string;
  content: string;
  blocks: Block[];
}

/**
 * Fetch the seed markdown from the existing private GitHub repository (server-side).
 * Uses GITHUB_* env vars so the token is never exposed to the browser.
 */
export async function fetchMarkdownFromGitHub(): Promise<string> {
  const token = process.env.GITHUB_TOKEN ?? process.env.VITE_GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER ?? process.env.VITE_GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO ?? process.env.VITE_GITHUB_REPO;
  const filePath = process.env.GITHUB_FILE_PATH ?? process.env.VITE_GITHUB_FILE_PATH ?? 'skillsheet.md';
  const branch = process.env.GITHUB_BRANCH ?? process.env.VITE_GITHUB_BRANCH ?? 'main';
  if (!token || !owner || !repo) {
    throw new Error('GitHub seed source is not configured (GITHUB_TOKEN/OWNER/REPO)');
  }
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

async function getOrCreateSheetId(db: Database): Promise<string> {
  const existing = await db
    .select({ id: skillSheets.id })
    .from(skillSheets)
    .where(eq(skillSheets.ownerId, OWNER_ID))
    .limit(1);
  if (existing[0]?.id) return existing[0].id;

  // owner_id unique + onConflictDoNothing guards against concurrent duplicate creation.
  const inserted = await db
    .insert(skillSheets)
    .values({ ownerId: OWNER_ID, title: TITLE })
    .onConflictDoNothing()
    .returning({ id: skillSheets.id });
  if (inserted[0]?.id) return inserted[0].id;

  // Another request won the race: re-read.
  const retry = await db
    .select({ id: skillSheets.id })
    .from(skillSheets)
    .where(eq(skillSheets.ownerId, OWNER_ID))
    .limit(1);
  return retry[0].id;
}

async function ensureSeeded(db: Database): Promise<string> {
  const sheetId = await getOrCreateSheetId(db);

  const existingBlocks = await db.select({ id: blocks.id }).from(blocks).where(eq(blocks.sheetId, sheetId)).limit(1);
  if (existingBlocks.length === 0) {
    const markdown = await fetchMarkdownFromGitHub();
    const segments = splitMarkdownIntoBlocks(markdown);
    if (segments.length > 0) {
      // (sheet_id, order) unique + onConflictDoNothing guards against concurrent seeding.
      await db
        .insert(blocks)
        .values(segments.map((data, order) => ({ sheetId, type: 'markdown', order, data })))
        .onConflictDoNothing();
    }
  }
  return sheetId;
}

/** Read the skill sheet from the DB, seeding from GitHub on first access. */
export async function getSkillSheet(): Promise<SkillSheet> {
  const db = getDb();
  const sheetId = await ensureSeeded(db);
  const rows = await db.select().from(blocks).where(eq(blocks.sheetId, sheetId)).orderBy(asc(blocks.order));

  const blockList: Block[] = rows.map((r) => ({
    id: r.id,
    type: r.type as Block['type'],
    order: r.order,
    data: r.data as Block['data'],
  }));

  return { title: TITLE, content: blocksToMarkdown(blockList), blocks: blockList };
}

export { OWNER_ID, TITLE };
