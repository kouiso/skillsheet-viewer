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
import { fetchMarkdownFromGitHub, getGitHubSeedConfig } from './github-seed';
import { blocks, skillSheets } from './schema';

export { fetchMarkdownFromGitHub, getGitHubSeedConfig, isGitHubSeedConfigured } from './github-seed';

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
 * 正本 DB に読み取れないブロックが残ったまま全置換保存しようとしたことを示すエラー。
 * 読込側は壊れた JSON / 未知 type を縮退して除外するため、見えていないブロックまで
 * delete→insert で消してしまう経路を、サーバー側の保存ガードで止める（M08）。
 */
export class UnreadableBlocksError extends Error {
  readonly blockIds: string[];
  constructor(blockIds: string[]) {
    super(`Sheet contains ${blockIds.length} unreadable block(s); save refused to avoid data loss`);
    this.name = 'UnreadableBlocksError';
    this.blockIds = blockIds;
  }
}

/**
 * オーナー識別子。個人名のベタ書きを排し環境変数から取得する（引き継ぎ汚染防止）。
 * 単一オーナー運用では Better Auth のオーナーアカウントに対応する安定IDを設定する。
 * 書き込みは isEditor()（Better Auth セッション必須）でゲートされる。
 */
export function getOwnerId(): string {
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

/** オーナーの既定シート（is_default）を取得、なければ既存最古シートを昇格、さらに無ければ作成して ID を返す。 */
async function getOrCreateDefaultSheetId(db: DbOrTx): Promise<string> {
  const ownerId = getOwnerId();
  const existing = await db
    .select({ id: skillSheets.id })
    .from(skillSheets)
    .where(and(eq(skillSheets.ownerId, ownerId), eq(skillSheets.isDefault, true)))
    .limit(1);
  if (existing[0]?.id) return existing[0].id;

  // 既定だけが失われた状態（既定シートの削除・旧データ移行直後など）では、
  // 空の既定シートを新規に増やすのではなく最古シートを既定へ昇格する。
  // is_default 導入前は「最も古いシートが既定」だったので、その意味を維持する（S09）。
  const [oldest] = await db
    .select({ id: skillSheets.id })
    .from(skillSheets)
    .where(eq(skillSheets.ownerId, ownerId))
    .orderBy(asc(skillSheets.updatedAt), asc(skillSheets.id))
    .limit(1);
  if (oldest) {
    // 同時実行では同じ行を同じ値で更新するだけなので冪等。別系統が先に既定を
    // 作っていた場合は部分ユニーク索引が落とす（稀なレースで利用者には再試行させる）。
    await db.update(skillSheets).set({ isDefault: true }).where(eq(skillSheets.id, oldest.id));
    return oldest.id;
  }

  // 部分ユニーク索引により owner ごとの既定は高々 1 枚。同時作成は conflict で
  // 片方だけが入り、負けた側は再 SELECT で勝者の ID を拾う（初回並行アクセスで
  // 既定が 2 枚生まれない、S09）。
  const inserted = await db
    .insert(skillSheets)
    .values({ ownerId, title: TITLE, isDefault: true })
    .onConflictDoNothing()
    .returning({ id: skillSheets.id });
  if (inserted[0]?.id) return inserted[0].id;

  const retry = await db
    .select({ id: skillSheets.id })
    .from(skillSheets)
    .where(and(eq(skillSheets.ownerId, ownerId), eq(skillSheets.isDefault, true)))
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
  const ownerId = getOwnerId();
  const existingDefault = await db
    .select({ id: skillSheets.id })
    .from(skillSheets)
    .where(and(eq(skillSheets.ownerId, ownerId), eq(skillSheets.isDefault, true)))
    .limit(1);
  if (existingDefault[0]?.id) return existingDefault[0].id;

  // 通常読取では書き込まない（S09 の要求）。is_default が全く無い期間だけ
  // 「最古」を実効既定として読む。フラグの確定は書込経路（削除時昇格・
  // 初回シート作成・既定への保存）に任せ、ここでは UPDATE/INSERT しない。
  const [oldest] = await db
    .select({ id: skillSheets.id })
    .from(skillSheets)
    .where(eq(skillSheets.ownerId, ownerId))
    .orderBy(asc(skillSheets.updatedAt), asc(skillSheets.id))
    .limit(1);
  if (oldest) return oldest.id;

  // GitHub seed は「オーナーにシートが 1 枚も無い初回導入」だけで実行する。
  // ブロック 0 件を再取り込みの合図にすると、ユーザーが全削除した直後に
  // 古い GitHub 本文が復活する（S09）。seed 取得に失敗した場合はシートも作らず
  // throw が伝播し、次回アクセスで再試行できる。
  let segments: ReturnType<typeof splitMarkdownIntoBlocks> = [];
  const config = getGitHubSeedConfig();
  if (config) {
    const markdown = await fetchMarkdownFromGitHub(config);
    // 分割で生じる空白のみのセグメントは「著者が置いた構造」ではなく分割ノイズなので、
    // ここは意図的に isBlockInputEmpty で除く（テンプレの空ブロックとは別物）。
    segments = splitMarkdownIntoBlocks(markdown).filter((data) => !isBlockInputEmpty({ type: 'markdown', data }));
  } else {
    // 未設定は正常系だが、意図せぬ設定漏れの調査ができるよう記録だけは残す。
    console.warn('[skillsheet] GitHub seed is not configured (GITHUB_TOKEN/OWNER/REPO); starting with an empty sheet.');
  }

  // 初回導入の一度だけの初期化。通常読取ではここに来ない（上で既存シートを返す）。
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(skillSheets)
      .values({ ownerId, title: TITLE, isDefault: true })
      .onConflictDoNothing()
      .returning({ id: skillSheets.id });
    const sheetId = inserted[0]?.id;
    if (sheetId) {
      // 既定を自分が作れた場合だけ seed ブロックを入れる。conflict 敗者は
      // 勝者側のシートをそのまま使う（ブロックの二重投入を防ぐ）。
      if (segments.length > 0) {
        await tx.insert(blocks).values(segments.map((data, order) => ({ sheetId, type: 'markdown', order, data })));
      }
      return sheetId;
    }
    const [winner] = await tx
      .select({ id: skillSheets.id })
      .from(skillSheets)
      .where(and(eq(skillSheets.ownerId, ownerId), eq(skillSheets.isDefault, true)))
      .limit(1);
    if (!winner) {
      throw new Error('Failed to resolve default sheet id after insert conflict');
    }
    return winner.id;
  });
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

/** rowToBlock と同じ判定だけを使いたい場所向けの、軽量な型ガード適用。 */
function isReadableBlockRow(type: string, data: unknown): boolean {
  return rowToBlock('probe', type, 0, data) !== null;
}

async function fetchSheetById(db: Database, sheetId: string, requireExists = false): Promise<SkillSheet> {
  // S08: ID 指定の読取にもオーナー境界を掛ける。一覧・保存・削除と揃え、
  // 別オーナーのシートと不存在を同じ「見つからない」にする（存在有無を漏らさない）。
  const [sheet] = await db
    .select({ title: skillSheets.title })
    .from(skillSheets)
    .where(and(eq(skillSheets.id, sheetId), eq(skillSheets.ownerId, getOwnerId())))
    .limit(1);
  if (!sheet) {
    if (requireExists) throw new SkillSheetNotFoundError(sheetId);
    // 親が自オーナーでない以上、その配下ブロックも読まない（孤児行の混入防止）。
    return { title: TITLE, content: '', blocks: [] };
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
  return db.transaction(async (tx) => createSheetInTx(tx, title, initialBlocks));
}

/**
 * 新規シートを作成するコア処理。トランザクションハンドルを受け取るため、
 * 呼び出し側でトランザクションをはり、他のテーブル（fixture 等）との原子性を保てる。
 */
export async function createSheetInTx(tx: DbOrTx, title: string, initialBlocks?: BlockInput[]): Promise<string> {
  const ownerId = getOwnerId();
  const resolvedTitle = title.trim().length > 0 ? title.trim() : TITLE;

  // 既定が無い状態で最初のシートを作るなら、それを既定にする。
  // 削除時昇格と合わせて「is_default が全く無い期間」を通常経路では発生させない。
  const [defaultExists] = await tx
    .select({ id: skillSheets.id })
    .from(skillSheets)
    .where(and(eq(skillSheets.ownerId, ownerId), eq(skillSheets.isDefault, true)))
    .limit(1);

  const inserted = await tx
    .insert(skillSheets)
    .values({ ownerId, title: resolvedTitle, isDefault: !defaultExists })
    .returning({ id: skillSheets.id });
  const sheetId = inserted[0]?.id;
  if (!sheetId) {
    throw new Error('Failed to create sheet: INSERT returned no id');
  }
  if (initialBlocks && initialBlocks.length > 0) {
    // 空ブロックはここで落とさない — テンプレの入力用スカフォールドが消えて
    // 見出しだけが残る不具合になる（issue #128）。空判定は描画時に行う。
    // ユーザーが「追加」を連打して埋めずに放置した空ブロックも同様に残り続けるが、
    // これは編集画面上で見えて削除もできる（閲覧側にだけ出ない）ので許容する。
    const normalized = initialBlocks.map(normalizeBlockInput);
    await tx
      .insert(blocks)
      .values(normalized.map((block, order) => ({ sheetId, type: block.type, order, data: block.data })));
  }
  return sheetId;
}

/**
 * 指定シートを削除する（ブロックも cascade で削除される）。
 * 削除したのが既定シートなら、同一トランザクション内で残りの最古シートを
 * 既定へ昇格する（S09: 昇格は読取ではなく書込操作の中で行う）。
 */
export async function deleteSheet(sheetId: string): Promise<void> {
  const db = getDb();
  const ownerId = getOwnerId();
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(skillSheets)
      .where(and(eq(skillSheets.id, sheetId), eq(skillSheets.ownerId, ownerId)))
      .returning({ isDefault: skillSheets.isDefault });
    if (!deleted?.isDefault) return;
    const [oldest] = await tx
      .select({ id: skillSheets.id })
      .from(skillSheets)
      .where(eq(skillSheets.ownerId, ownerId))
      .orderBy(asc(skillSheets.updatedAt), asc(skillSheets.id))
      .limit(1);
    if (oldest) {
      await tx.update(skillSheets).set({ isDefault: true }).where(eq(skillSheets.id, oldest.id));
    }
  });
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

  // 空ブロックはここで落とさない（createSheet と同じ理由。issue #128）。
  const normalized = blocksInput.map(normalizeBlockInput);
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
      // tRPC + superjson 経由なら Date のまま渡るが、DB ドライバーが文字列を
      // 返すこともある。呼び出し元を問わず安全に比較できるよう、両辺を必ず
      // Date へ正規化してから getTime() で比較する。
      const expectedTime = new Date(expectedUpdatedAt).getTime();
      const currentTime = current ? new Date(current.updatedAt).getTime() : 0;
      if (current && currentTime > expectedTime) {
        throw new ConflictError();
      }
    }

    // M08: 読み取れないブロックが残っているシートへの全置換を拒否する。
    // 読込側（rowToBlock → filter）は壊れた行を縮退して捨てるため、画面に出なかった
    // 元データまで delete→insert で失う経路をここで塞ぐ。修復は明示操作として分離する。
    const currentRows = await tx
      .select({ id: blocks.id, type: blocks.type, data: blocks.data })
      .from(blocks)
      .where(eq(blocks.sheetId, resolvedSheetId));
    const unreadableIds = currentRows.filter((r) => !isReadableBlockRow(r.type, r.data)).map((r) => r.id);
    if (unreadableIds.length > 0) {
      throw new UnreadableBlocksError(unreadableIds);
    }

    await tx.delete(blocks).where(eq(blocks.sheetId, resolvedSheetId));
    if (normalized.length > 0) {
      await tx.insert(blocks).values(
        normalized.map((block, order) => ({
          sheetId: resolvedSheetId,
          type: block.type,
          order,
          data: block.data,
        })),
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
    // DB ドライバーが文字列を返す場合も Date で統一する（Date インスタンスの場合はそのまま）。
    const updatedAt = updated.updatedAt instanceof Date ? updated.updatedAt : new Date(updated.updatedAt);
    return { updatedAt };
  });
}

export { TITLE };
