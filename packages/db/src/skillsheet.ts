/**
 * Server-side skill sheet read path (NeonDB is the source of truth).
 *
 * Read ordered blocks from the DB, and on first request seed them from the
 * existing GitHub markdown source if the sheet is empty.
 *
 * Server-only. Never import this from a Client Component.
 */
import { asc, eq, sql } from 'drizzle-orm';

import {
  type Block,
  type BlockInput,
  blocksToMarkdown,
  isBlockInputEmpty,
  isMarkdownBlockData,
  isTableBlockData,
  normalizeTableBlockData,
  splitMarkdownIntoBlocks,
} from './blocks';
import { type Database, getDb } from './client';
import { blocks, skillSheets } from './schema';

/**
 * オーナー識別子。個人名のベタ書きを排し環境変数から取得する（引き継ぎ汚染防止）。
 * 単一オーナー運用では Better Auth のオーナーアカウントに対応する安定IDを設定する。
 * 書き込みは isEditor()（Better Auth セッション必須）でゲートされる。
 */
function getOwnerId(): string {
  const id = process.env.SKILLSHEET_OWNER_ID;
  if (!id) throw new Error('SKILLSHEET_OWNER_ID is not set');
  return id;
}
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
  const ownerId = getOwnerId();
  const existing = await db
    .select({ id: skillSheets.id })
    .from(skillSheets)
    .where(eq(skillSheets.ownerId, ownerId))
    .limit(1);
  if (existing[0]?.id) return existing[0].id;

  // owner_id unique + onConflictDoNothing guards against concurrent duplicate creation.
  const inserted = await db
    .insert(skillSheets)
    .values({ ownerId, title: TITLE })
    .onConflictDoNothing()
    .returning({ id: skillSheets.id });
  if (inserted[0]?.id) return inserted[0].id;

  // Another request won the race: re-read.
  const retry = await db
    .select({ id: skillSheets.id })
    .from(skillSheets)
    .where(eq(skillSheets.ownerId, ownerId))
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

/**
 * DB の 1 行を検証付きで Block へ変換する。
 * 壊れた/未知の JSON は生 cast で通さず、不正なら null を返して skip する
 * （TableBlockEditor 等が壊れたデータで crash しないようにする読み込み側の防御）。
 */
function rowToBlock(id: string, type: string, order: number, data: unknown): Block | null {
  if (type === 'markdown' && isMarkdownBlockData(data)) {
    return { id, type: 'markdown', order, data };
  }
  if (type === 'table' && isTableBlockData(data)) {
    return { id, type: 'table', order, data: normalizeTableBlockData(data) };
  }
  return null;
}

/** Read the skill sheet from the DB, seeding from GitHub on first access. */
export async function getSkillSheet(): Promise<SkillSheet> {
  const db = getDb();
  const sheetId = await ensureSeeded(db);
  const [sheet] = await db
    .select({ title: skillSheets.title })
    .from(skillSheets)
    .where(eq(skillSheets.id, sheetId))
    .limit(1);
  const rows = await db.select().from(blocks).where(eq(blocks.sheetId, sheetId)).orderBy(asc(blocks.order));

  const blockList: Block[] = rows
    .map((r) => rowToBlock(r.id, r.type, r.order, r.data))
    .filter((b): b is Block => b !== null);

  // タイトルは DB 正本。null/空のときのみ既定値（TITLE）へフォールバックする。
  const title = sheet?.title && sheet.title.trim().length > 0 ? sheet.title : TITLE;

  return { title, content: blocksToMarkdown(blockList), blocks: blockList };
}

/** 保存前にブロック入力を正規化する（markdown は末尾空白除去、table は行を列数へ正規化）。 */
function normalizeBlockInput(block: BlockInput): BlockInput {
  if (block.type === 'markdown') return { type: 'markdown', data: { markdown: block.data.markdown.trimEnd() } };
  return { type: 'table', data: normalizeTableBlockData(block.data) };
}

/**
 * Replace the owner's sheet blocks with the given typed blocks and persist the
 * title (D&D builder save path). 空ブロックは type 別に判定して drop し、
 * 残ったブロックに index で order を連番再付与する（gap 無し＝unique 制約と整合）。
 *
 * delete→insert→update を1つのトランザクションで囲み原子性を保証する
 * （途中失敗で旧ブロックだけ消える＝データ損失を防ぐ）。neon-http は
 * 対話的トランザクションは非対応だが、このようなバッチ（中間読み取り無し）の
 * transaction() はサポートされる。
 */
export async function saveSkillSheetBlocks(title: string, blocksInput: BlockInput[]): Promise<void> {
  const db = getDb();
  const sheetId = await getOrCreateSheetId(db);

  const cleaned = blocksInput.map(normalizeBlockInput).filter((b) => !isBlockInputEmpty(b));
  // title は notNull のため空のときは既定値を保存する（読み込み側もフォールバックする）。
  const resolvedTitle = title.trim().length > 0 ? title.trim() : TITLE;

  await db.transaction(async (tx) => {
    await tx.delete(blocks).where(eq(blocks.sheetId, sheetId));
    if (cleaned.length > 0) {
      await tx
        .insert(blocks)
        .values(cleaned.map((block, order) => ({ sheetId, type: block.type, order, data: block.data })));
    }
    await tx
      .update(skillSheets)
      .set({ title: resolvedTitle, updatedAt: sql`now()` })
      .where(eq(skillSheets.id, sheetId));
  });
}

export { TITLE };
