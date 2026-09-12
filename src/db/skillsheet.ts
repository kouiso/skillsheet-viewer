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
import { blocks, skillSheets, skillsheetState } from './schema';

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

/**
 * owner 単位のアドバイザリロック。既定フラグや初期化を変更する書込トランザクションの
 * 先頭で取り、同時実行の createSheetInTx / deleteSheet / 初回初期化が
 * 「既定なし」を同時に観測して部分ユニーク索引違反（500）にならないようにする（S09）。
 * トランザクション終了時に自動解放される。
 */
async function lockOwner(tx: DbOrTx, ownerId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ownerId}))`);
}

/** 既定シートが無いときの実効既定（最古）を返す。昇格の書き込みは行わない。 */
async function findOldestSheetId(db: DbOrTx, ownerId: string): Promise<string | undefined> {
  const [oldest] = await db
    .select({ id: skillSheets.id })
    .from(skillSheets)
    .where(eq(skillSheets.ownerId, ownerId))
    .orderBy(asc(skillSheets.createdAt), asc(skillSheets.id))
    .limit(1);
  return oldest?.id;
}

/**
 * オーナーの既定シート ID を返す。なければ既存最古シートを昇格、さらに無ければ作成する。
 * 書込経路（保存・作成）からだけ呼ぶこと。読取では書き込まない（S09）。
 * 呼び出し側のトランザクション内で lockOwner を取り、既定操作を owner 単位で直列化する。
 */
async function getOrCreateDefaultSheetId(tx: DbOrTx): Promise<string> {
  const ownerId = getOwnerId();
  await lockOwner(tx, ownerId);

  const existing = await tx
    .select({ id: skillSheets.id })
    .from(skillSheets)
    .where(and(eq(skillSheets.ownerId, ownerId), eq(skillSheets.isDefault, true)))
    .limit(1);
  if (existing[0]?.id) return existing[0].id;

  // 既定だけが失われた状態（既定シートの削除・旧データ移行直後など）では、
  // 空の既定シートを新規に増やすのではなく最古シートを既定へ昇格する（S09）。
  const oldestId = await findOldestSheetId(tx, ownerId);
  if (oldestId) {
    await tx.update(skillSheets).set({ isDefault: true }).where(eq(skillSheets.id, oldestId));
    return oldestId;
  }

  // 部分ユニーク索引により owner ごとの既定は高々 1 枚。advisory lock で直列化済み
  // だが、ロック範囲外（手動SQL等）で作られた場合に備え conflict フォールバックも残す。
  const inserted = await tx
    .insert(skillSheets)
    .values({ ownerId, title: TITLE, isDefault: true })
    .onConflictDoNothing()
    .returning({ id: skillSheets.id });
  if (inserted[0]?.id) {
    // 書込経路での作成は「初期化済み」の印も立てる。初回 seed は読取側の一度だけの
    // 初期化が担うので、ここでは空の既定を作るだけに留める。
    await tx.insert(skillsheetState).values({ ownerId }).onConflictDoNothing();
    return inserted[0].id;
  }

  const retry = await tx
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

/**
 * 読取用の既定シート解決。通常読取では一切書き込まない（S09 の要求）。
 * - is_default あり → その ID
 * - フラグ無し・シートあり → 最古を実効既定として返すだけ（書かない）
 * - シート 0 枚・初期化済み → null（全削除済み。初期データを復活させない）
 * - シート 0 枚・未初期化 → 一度だけの初期化として既定を作り seed する
 */
async function ensureSeeded(db: Database): Promise<string | null> {
  const ownerId = getOwnerId();
  const existingDefault = await db
    .select({ id: skillSheets.id })
    .from(skillSheets)
    .where(and(eq(skillSheets.ownerId, ownerId), eq(skillSheets.isDefault, true)))
    .limit(1);
  if (existingDefault[0]?.id) return existingDefault[0].id;

  const oldestId = await findOldestSheetId(db, ownerId);
  if (oldestId) return oldestId;

  // シート 0 枚。初期化済みなら「ユーザーが全削除した状態」なので何も作らない。
  const [state] = await db
    .select({ ownerId: skillsheetState.ownerId })
    .from(skillsheetState)
    .where(eq(skillsheetState.ownerId, ownerId))
    .limit(1);
  if (state) return null;

  // 未初期化 = 初回導入。GitHub seed はこの一度だけ実行する。
  // seed 取得に失敗した場合はシートも作らず throw が伝播し、次回アクセスで再試行できる。
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

  return db.transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    // ロック待ちの間に別系統が初期化した可能性があるため再確認する
    const [state2] = await tx
      .select({ ownerId: skillsheetState.ownerId })
      .from(skillsheetState)
      .where(eq(skillsheetState.ownerId, ownerId))
      .limit(1);
    if (state2) {
      return (await findOldestSheetId(tx, ownerId)) ?? null;
    }
    await tx.insert(skillsheetState).values({ ownerId }).onConflictDoNothing();

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

  // 既定フラグの読み書きを owner 単位で直列化する。これを取らないと
  // 同時作成の両方が「既定なし」を観測して部分ユニーク索引で 500 になる（S09）。
  await lockOwner(tx, ownerId);

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
    await lockOwner(tx, ownerId);
    const [deleted] = await tx
      .delete(skillSheets)
      .where(and(eq(skillSheets.id, sheetId), eq(skillSheets.ownerId, ownerId)))
      .returning({ isDefault: skillSheets.isDefault });
    if (!deleted?.isDefault) return;
    const oldestId = await findOldestSheetId(tx, ownerId);
    if (oldestId) {
      await tx.update(skillSheets).set({ isDefault: true }).where(eq(skillSheets.id, oldestId));
    }
  });
}

/** 指定 ID のシートを読む。ID 未指定またはデフォルト読み込み時は GitHub シードを実行する。 */
export async function getSkillSheetById(sheetId: string): Promise<SkillSheet> {
  const db = getDb();
  return fetchSheetById(db, sheetId, true);
}

/** Read the skill sheet from the DB, seeding from GitHub only on the very first initialization. */
export async function getSkillSheet(): Promise<SkillSheet> {
  const db = getDb();
  const sheetId = await ensureSeeded(db);
  // null は「初期化済みだがシート 0 枚 = ユーザーが全削除した状態」。
  // 空シートをそのまま返し、初期データを復活させない（S09）。
  if (!sheetId) return { title: TITLE, content: '', blocks: [] };
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
