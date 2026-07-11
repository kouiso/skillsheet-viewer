/**
 * Server-side skill sheet read path (NeonDB is the source of truth).
 *
 * Read ordered blocks from the DB, and on first request seed them from the
 * existing GitHub markdown source if the sheet is empty.
 *
 * Server-only. Never import this from a Client Component.
 */
import { and, asc, eq, sql } from 'drizzle-orm';

import {
  type Block,
  type BlockInput,
  blocksToMarkdown,
  isBlockInputEmpty,
  isExperienceBlockData,
  isMarkdownBlockData,
  isProfileBlockData,
  isProjectBlockData,
  isSkillsBlockData,
  isStatsBlockData,
  isTableBlockData,
  normalizeTableBlockData,
  splitMarkdownIntoBlocks,
} from './blocks';
import { type Database, getDb } from './client';
import { blocks, skillSheets } from './schema';

/**
 * Database か、そのトランザクションハンドル（`db.transaction` のコールバック引数）の
 * いずれかを受け取れる型。トランザクション内のヘルパーが外側の `db` ではなく `tx` を
 * 使えるようにして、原子性を保つ（A2）。
 */
type DbOrTx = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/** 並行保存競合を示すエラー（saveSkillSheetBlocks から throw され actions 層で識別する）。 */
export class ConflictError extends Error {
  constructor() {
    super('Conflict: sheet was modified by another session');
    this.name = 'ConflictError';
  }
}

/** 指定 ID のシートが存在しないことを示すエラー（getSkillSheetById から throw される）。 */
export class SkillSheetNotFoundError extends Error {
  constructor(sheetId: string) {
    super(`Sheet not found: ${sheetId}`);
    this.name = 'SkillSheetNotFoundError';
  }
}

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

export interface SheetSummary {
  id: string;
  title: string;
  updatedAt: Date;
}

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
 */
export async function fetchMarkdownFromGitHub(): Promise<string> {
  const config = getGitHubSeedConfig();
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

/** オーナーの最初のシートを取得、なければ作成して ID を返す（シード用デフォルトシート）。 */
async function getOrCreateDefaultSheetId(db: DbOrTx): Promise<string> {
  const ownerId = getOwnerId();
  const existing = await db
    .select({ id: skillSheets.id })
    .from(skillSheets)
    .where(eq(skillSheets.ownerId, ownerId))
    .orderBy(asc(skillSheets.updatedAt))
    .limit(1);
  if (existing[0]?.id) return existing[0].id;

  const inserted = await db.insert(skillSheets).values({ ownerId, title: TITLE }).returning({ id: skillSheets.id });
  if (inserted[0]?.id) return inserted[0].id;

  // 競合: 別リクエストが先に作成した場合
  const retry = await db
    .select({ id: skillSheets.id })
    .from(skillSheets)
    .where(eq(skillSheets.ownerId, ownerId))
    .orderBy(asc(skillSheets.updatedAt))
    .limit(1);
  const retryId = retry[0]?.id;
  if (!retryId) {
    // INSERT が 0 行を返し、再 SELECT でも見つからない稀なレース。黙って undefined を
    // 返すと下流で TypeError になるため、明示的に落として原因を分かるようにする。
    throw new Error('Failed to resolve default sheet id after insert conflict');
  }
  return retryId;
}

async function ensureSeeded(db: Database): Promise<string> {
  const sheetId = await getOrCreateDefaultSheetId(db);

  const existingBlocks = await db.select({ id: blocks.id }).from(blocks).where(eq(blocks.sheetId, sheetId)).limit(1);
  // ブロックが 0 個なのは新規オーナー / 全削除後の正常状態。GitHub seed は任意の副系統で
  // 正本は DB のため、未設定なら seed をスキップして空のまま返す（throw して「エラー」に
  // しない）。設定済みで取得に失敗した場合だけ本物の異常として throw が伝播する。
  if (existingBlocks.length === 0 && isGitHubSeedConfigured()) {
    const markdown = await fetchMarkdownFromGitHub();
    const segments = splitMarkdownIntoBlocks(markdown);
    if (segments.length > 0) {
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
  if (type === 'skills' && isSkillsBlockData(data)) {
    return { id, type: 'skills', order, data };
  }
  if (type === 'experience' && isExperienceBlockData(data)) {
    return { id, type: 'experience', order, data };
  }
  if (type === 'profile' && isProfileBlockData(data)) {
    return { id, type: 'profile', order, data };
  }
  if (type === 'stats' && isStatsBlockData(data)) {
    return { id, type: 'stats', order, data };
  }
  if (type === 'project' && isProjectBlockData(data)) {
    return { id, type: 'project', order, data };
  }
  return null;
}

async function fetchSheetById(db: Database, sheetId: string, requireExists = false): Promise<SkillSheet> {
  const [sheet] = await db
    .select({ title: skillSheets.title })
    .from(skillSheets)
    .where(eq(skillSheets.id, sheetId))
    .limit(1);
  if (requireExists && !sheet) {
    throw new SkillSheetNotFoundError(sheetId);
  }
  const rows = await db.select().from(blocks).where(eq(blocks.sheetId, sheetId)).orderBy(asc(blocks.order));

  const blockList: Block[] = rows
    .map((r) => rowToBlock(r.id, r.type, r.order, r.data))
    .filter((b): b is Block => b !== null);

  const title = sheet?.title && sheet.title.trim().length > 0 ? sheet.title : TITLE;
  return { title, content: blocksToMarkdown(blockList), blocks: blockList };
}

/** オーナーのシート一覧を返す（updatedAt 降順）。 */
export async function listSheets(): Promise<SheetSummary[]> {
  const db = getDb();
  const ownerId = getOwnerId();
  const rows = await db
    .select({ id: skillSheets.id, title: skillSheets.title, updatedAt: skillSheets.updatedAt })
    .from(skillSheets)
    .where(eq(skillSheets.ownerId, ownerId))
    .orderBy(asc(skillSheets.updatedAt));
  return rows;
}

/** 新規シートを作成して ID を返す。initialBlocks を渡すとテンプレートブロックを初期値として挿入する。 */
export async function createSheet(title: string, initialBlocks?: BlockInput[]): Promise<string> {
  const db = getDb();
  const ownerId = getOwnerId();
  const resolvedTitle = title.trim().length > 0 ? title.trim() : TITLE;

  // skillSheets への insert と blocks への insert を同一トランザクションで囲み、
  // ブロック挿入が失敗したときにシートだけが残る不整合を防ぐ（原子性の担保）。
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(skillSheets)
      .values({ ownerId, title: resolvedTitle })
      .returning({ id: skillSheets.id });
    const sheetId = inserted[0]?.id;
    if (!sheetId) {
      throw new Error('Failed to create sheet: INSERT returned no id');
    }
    if (initialBlocks && initialBlocks.length > 0) {
      const cleaned = initialBlocks.map(normalizeBlockInput).filter((b) => !isBlockInputEmpty(b));
      if (cleaned.length > 0) {
        await tx
          .insert(blocks)
          .values(cleaned.map((block, order) => ({ sheetId, type: block.type, order, data: block.data })));
      }
    }
    return sheetId;
  });
}

/** 指定シートを削除する（ブロックも cascade で削除される）。 */
export async function deleteSheet(sheetId: string): Promise<void> {
  const db = getDb();
  const ownerId = getOwnerId();
  await db.delete(skillSheets).where(and(eq(skillSheets.id, sheetId), eq(skillSheets.ownerId, ownerId)));
}

/** 指定 ID のシートを読む。ID 未指定またはデフォルト読み込み時は GitHub シードを実行する。 */
export async function getSkillSheetById(sheetId: string): Promise<SkillSheet> {
  const db = getDb();
  return fetchSheetById(db, sheetId, true);
}

/** Read the skill sheet from the DB, seeding from GitHub on first access. */
export async function getSkillSheet(): Promise<SkillSheet> {
  const db = getDb();
  const sheetId = await ensureSeeded(db);
  return fetchSheetById(db, sheetId);
}

/** 保存前にブロック入力を正規化する（markdown は末尾空白除去、table は行を列数へ正規化）。 */
function normalizeBlockInput(block: BlockInput): BlockInput {
  if (block.type === 'markdown') return { type: 'markdown', data: { markdown: block.data.markdown.trimEnd() } };
  if (block.type === 'skills') return block;
  if (block.type === 'experience') return block;
  if (block.type === 'profile') return block;
  if (block.type === 'stats') return block;
  if (block.type === 'project') return block;
  return { type: 'table', data: normalizeTableBlockData(block.data) };
}

/**
 * 指定シートのブロックを保存する。sheetId を明示することで複数シートに対応。
 * sheetId が未指定のときはオーナーのデフォルトシートへ保存する（後方互換）。
 *
 * A2: sheetId 指定時はオーナー検証を実施（他人のシートを破壊しない）。
 * A3: expectedUpdatedAt を指定すると、トランザクション内でシートの updatedAt が
 *     それより新しい場合に ConflictError を throw する（並行保存ガード）。
 */
export async function saveSkillSheetBlocks(
  title: string,
  blocksInput: BlockInput[],
  sheetId?: string,
  expectedUpdatedAt?: Date,
): Promise<{ updatedAt: Date }> {
  const db = getDb();
  const ownerId = getOwnerId();

  const cleaned = blocksInput.map(normalizeBlockInput).filter((b) => !isBlockInputEmpty(b));
  const resolvedTitle = title.trim().length > 0 ? title.trim() : TITLE;

  return db.transaction(async (tx) => {
    let resolvedSheetId: string;
    if (sheetId) {
      // A2: 所有者検証 — deleteSheet と同じく、DELETE と同一トランザクション内で
      // id+ownerId を照合する（別クエリにすると TOCTOU の隙が生まれるため避ける）。
      const [existing] = await tx
        .select({ id: skillSheets.id })
        .from(skillSheets)
        .where(and(eq(skillSheets.id, sheetId), eq(skillSheets.ownerId, ownerId)))
        .limit(1);
      if (!existing) {
        throw new Error('Forbidden: sheet does not belong to the current owner');
      }
      resolvedSheetId = sheetId;
    } else {
      // トランザクション内では外側の db ではなく tx を使い、デフォルトシートの
      // 作成も同一トランザクションに含める（ロールバック時に残留させない）。
      resolvedSheetId = await getOrCreateDefaultSheetId(tx);
    }

    // A3: 並行保存ガード — 別セッションが先に保存していたら中断する。
    // for('update') で行ロックを取得し、Read Committed 下でも他トランザクションの
    // コミット待ちにして古い updatedAt を読まないようにする（ロストアップデート防止）。
    if (expectedUpdatedAt) {
      const [current] = await tx
        .select({ updatedAt: skillSheets.updatedAt })
        .from(skillSheets)
        .where(eq(skillSheets.id, resolvedSheetId))
        .for('update')
        .limit(1);
      // Server Actions 経由のシリアライズで Date が string 化される可能性に備え、
      // 比較前に必ず Date へ正規化してから getTime() で比較する。
      const expectedTime = new Date(expectedUpdatedAt).getTime();
      if (current && current.updatedAt.getTime() > expectedTime) {
        throw new ConflictError();
      }
    }

    await tx.delete(blocks).where(eq(blocks.sheetId, resolvedSheetId));
    if (cleaned.length > 0) {
      await tx
        .insert(blocks)
        .values(
          cleaned.map((block, order) => ({ sheetId: resolvedSheetId, type: block.type, order, data: block.data })),
        );
    }
    const [updated] = await tx
      .update(skillSheets)
      .set({ title: resolvedTitle, updatedAt: sql`now()` })
      .where(eq(skillSheets.id, resolvedSheetId))
      .returning({ updatedAt: skillSheets.updatedAt });
    if (!updated) {
      throw new Error('Failed to update sheet: row not found');
    }
    // 保存後のサーバー時刻の updatedAt を返す。クライアントはこれを次回の
    // expectedUpdatedAt に用いることで、クライアント時計とのズレによる誤 Conflict を防ぐ（A4）。
    return { updatedAt: updated.updatedAt };
  });
}

export { TITLE };
