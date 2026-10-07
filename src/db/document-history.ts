import { createHash } from 'node:crypto';
import { isProjectBlockData } from './block';
import type { Database } from './client';
import { canonicalJson, isRevision, type RawDocumentBlock } from './document-contract';
import { createHistoryRepository } from './document-repository';
import { createDocumentService, DocumentError, type DocumentSnapshot, readDocumentResult } from './document-service';

export interface VersionSummary {
  revision: string;
  title: string;
  recordedAt: string;
  action: string;
  restoredFrom: string | null;
  restoredBefore: string | null;
}
export interface VisibleChange {
  blockId: string;
  companyId: string;
  company: string;
  projectId?: string;
  project?: string;
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function id(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
    throw new DocumentError('INVALID_ID');
}
function revision(value: string) {
  if (!isRevision(value)) throw new DocumentError('INVALID_REVISION');
}
function snapshot(value: unknown): DocumentSnapshot {
  if (object(value) && ['CONFLICT', 'NOT_FOUND', 'INVALID_STATE'].includes(String(value.status)))
    throw new DocumentError(String(value.status));
  const result = readDocumentResult(value);
  if (result.status !== 'OK') throw new DocumentError(result.status);
  return result.snapshot;
}

/** 閲覧と同じ会社・案件の二段階hiddenを評価し、対象に新しく見える項目だけを列挙する。 */
export function visibleChanges(current: RawDocumentBlock[], target: RawDocumentBlock[]): VisibleChange[] {
  function visible(blocks: RawDocumentBlock[]) {
    const entries = new Map<string, VisibleChange>();
    for (const block of blocks) {
      if (block.type !== 'project' || !isProjectBlockData(block.data)) continue;
      for (const company of block.data.companies) {
        if (company.hidden) continue;
        entries.set(`${block.id}:company:${company.id}`, {
          blockId: block.id,
          companyId: company.id,
          company: company.name,
        });
        for (const project of block.data.items) {
          if (project.companyId !== company.id || project.hidden) continue;
          entries.set(`${block.id}:project:${project.id}`, {
            blockId: block.id,
            companyId: company.id,
            company: company.name,
            projectId: project.id,
            project: project.title,
          });
        }
      }
    }
    return entries;
  }
  const before = visible(current);
  return [...visible(target)].filter(([key]) => !before.has(key)).map(([, value]) => value);
}

export function createDocumentHistory(db: Pick<Database, 'execute'>, owner: string) {
  const repository = createHistoryRepository(db, owner),
    documents = createDocumentService(db, owner);
  async function read(sheetId: string, targetRevision: string) {
    id(sheetId);
    revision(targetRevision);
    const result = await repository.read(sheetId, targetRevision);
    if (result.status !== 'OK') throw new DocumentError(result.status);
    if (result.snapshot.sheetId.toLowerCase() !== sheetId.toLowerCase() || result.snapshot.revision !== targetRevision)
      throw new DocumentError('SNAPSHOT_ID_MISMATCH');
    return result.snapshot;
  }
  async function previewRestore(sheetId: string, targetRevision: string, expectedRevision: string) {
    id(sheetId);
    revision(targetRevision);
    revision(expectedRevision);
    const current = await documents.read(sheetId);
    if (current.status !== 'OK') throw new DocumentError(current.status);
    if (current.snapshot.revision !== expectedRevision) throw new DocumentError('CONFLICT');
    const target = await read(sheetId, targetRevision);
    const sameContent =
      current.snapshot.title === target.title &&
      canonicalJson(current.snapshot.blocks) === canonicalJson(target.blocks);
    const newlyVisible = visibleChanges(current.snapshot.blocks, target.blocks);
    const visibilityUncertain = !current.snapshot.validation.editable;
    const confirmation = createHash('sha256')
      .update(
        canonicalJson({
          sheetId,
          currentRevision: expectedRevision,
          targetRevision,
          newlyVisible,
          visibilityUncertain,
        }),
      )
      .digest('hex');
    const laterRevisionCount = await repository.countAfter(sheetId, targetRevision, expectedRevision);
    if (!isRevision(laterRevisionCount)) throw new DocumentError('INVALID_DB_RESPONSE');
    return {
      current: current.snapshot,
      target,
      newlyVisible,
      visibilityUncertain,
      confirmation,
      canRestore: target.validation.editable && !sameContent,
      sameContent,
      laterRevisionCount,
    };
  }
  return {
    read,
    previewRestore,
    async list(sheetId: string, beforeRevision?: string, limit = 20): Promise<VersionSummary[]> {
      id(sheetId);
      if (beforeRevision !== undefined) revision(beforeRevision);
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new DocumentError('INVALID_LIMIT');
      const rows = await repository.list(sheetId, beforeRevision ?? null, limit);
      if (!Array.isArray(rows)) throw new DocumentError('INVALID_DB_RESPONSE');
      let previous = beforeRevision;
      return rows.map((row) => {
        if (
          !object(row) ||
          !isRevision(row.revision) ||
          typeof row.title !== 'string' ||
          typeof row.recordedAt !== 'string' ||
          !Number.isFinite(Date.parse(row.recordedAt)) ||
          typeof row.action !== 'string' ||
          (row.restoredFrom !== null && !isRevision(row.restoredFrom)) ||
          (row.restoredBefore !== null && !isRevision(row.restoredBefore))
        )
          throw new DocumentError('INVALID_DB_RESPONSE');
        if (previous !== undefined && BigInt(row.revision) >= BigInt(previous))
          throw new DocumentError('INVALID_DB_RESPONSE');
        previous = row.revision;
        return {
          revision: row.revision,
          title: row.title,
          recordedAt: row.recordedAt,
          action: row.action,
          restoredFrom: row.restoredFrom as string | null,
          restoredBefore: row.restoredBefore as string | null,
        };
      });
    },
    async restore(sheetId: string, targetRevision: string, expectedRevision: string, confirmation: string) {
      const preview = await previewRestore(sheetId, targetRevision, expectedRevision);
      if (preview.sameContent) throw new DocumentError('ALREADY_CURRENT');
      if (!preview.canRestore) throw new DocumentError('UNEDITABLE_DOCUMENT', preview.target.validation.issues);
      if (confirmation !== preview.confirmation) throw new DocumentError('VISIBILITY_CONFIRMATION_REQUIRED');
      const saved = snapshot(await repository.restore(sheetId, targetRevision, expectedRevision));
      if (
        saved.sheetId.toLowerCase() !== sheetId.toLowerCase() ||
        saved.revision !== (BigInt(expectedRevision) + 1n).toString() ||
        saved.title !== preview.target.title ||
        canonicalJson(saved.blocks) !== canonicalJson(preview.target.blocks)
      )
        throw new DocumentError('SNAPSHOT_ID_MISMATCH');
      return { snapshot: saved, undoRevision: expectedRevision, undoAvailable: preview.current.validation.editable };
    },
    async deletedList() {
      const rows = await repository.deletedList();
      if (!Array.isArray(rows)) throw new DocumentError('INVALID_DB_RESPONSE');
      return rows.map((row) => {
        if (
          !object(row) ||
          typeof row.sheetId !== 'string' ||
          !isRevision(row.revision) ||
          typeof row.title !== 'string' ||
          typeof row.deletedAt !== 'string' ||
          !Number.isFinite(Date.parse(row.deletedAt))
        )
          throw new DocumentError('INVALID_DB_RESPONSE');
        id(row.sheetId);
        return { sheetId: row.sheetId, revision: row.revision, title: row.title, deletedAt: row.deletedAt };
      });
    },
    async previewDeleted(sheetId: string, expectedDeletionRevision: string) {
      const target = await read(sheetId, expectedDeletionRevision);
      const rows = await repository.deletedList();
      if (
        !Array.isArray(rows) ||
        !rows.some((row) => object(row) && row.sheetId === sheetId && row.revision === expectedDeletionRevision)
      )
        throw new DocumentError('CONFLICT');
      const newlyVisible = visibleChanges([], target.blocks);
      const confirmation = createHash('sha256')
        .update(
          canonicalJson({
            sheetId,
            expectedDeletionRevision,
            newlyVisible,
            title: target.title,
            blocks: target.blocks,
          }),
        )
        .digest('hex');
      return { target, newlyVisible, confirmation, canRestore: target.validation.editable };
    },
    async restoreDeleted(sheetId: string, expectedDeletionRevision: string, confirmation: string) {
      const preview = await this.previewDeleted(sheetId, expectedDeletionRevision);
      if (!preview.canRestore) throw new DocumentError('UNEDITABLE_DOCUMENT', preview.target.validation.issues);
      if (confirmation !== preview.confirmation) throw new DocumentError('VISIBILITY_CONFIRMATION_REQUIRED');
      const saved = snapshot(await repository.restoreDeleted(sheetId, expectedDeletionRevision));
      if (
        saved.sheetId.toLowerCase() !== sheetId.toLowerCase() ||
        saved.revision !== (BigInt(expectedDeletionRevision) + 1n).toString() ||
        saved.title !== preview.target.title ||
        canonicalJson(saved.blocks) !== canonicalJson(preview.target.blocks)
      )
        throw new DocumentError('SNAPSHOT_ID_MISMATCH');
      return saved;
    },
  };
}
