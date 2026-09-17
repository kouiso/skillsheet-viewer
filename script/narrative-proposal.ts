/**
 * 本人文章（案件の comment/duties/acquired/scope/role、会社の note/kind）の更新案を作る。
 *
 * タイトル・会社名の文字列一致は「候補を探す」ためだけに使い、書き換え対象の同一性は
 * 解決した blockId + targetId(UUID) + field と before/after hash に束縛する。
 * 同名タイトルが複数ある場合は解決せず失敗させる（推測で片方を選ばない）。
 *
 * このファイルはDBへ触れない。proposal は未承認（approved:false）で、
 * 本人が差分を確認したあと narrative-approval.ts が承認記録を私有領域へ固定する。
 */
import { createHash } from 'node:crypto';
import { isBlockInput, type ProjectBlockData } from '../src/db/block';
import {
  canonicalJson,
  type DocumentIssue,
  isRevision,
  type RawDocumentBlock,
  validateDocumentBlocks,
} from '../src/db/document-contract';
import type { DocumentSnapshot } from '../src/db/document-service';
import type { NarrativeFile } from './apply-project-narrative';

const hash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
// summary のような optional field は未設定時 undefined で canonicalJson が投げる。
// 「未設定」と空文字列は同じ「内容なし」として正規化する。
const hashField = (value: unknown) => hash(value ?? '');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PROJECT_NARRATIVE_FIELDS = ['comment', 'duties', 'acquired', 'scope', 'role', 'summary'] as const;
export const COMPANY_NARRATIVE_FIELDS = ['note', 'kind'] as const;

export interface NarrativeChange {
  blockId: string;
  /** 案件 item.id または会社 company.id。タイトル文字列ではなくUUIDで対象を固定する。 */
  targetId: string;
  targetKind: 'project' | 'company';
  field: string;
  beforeHash: string;
  afterHash: string;
  /** 候補の根拠となった入力JSON内パッチのhash。根拠が変われば承認をstaleにする。 */
  evidenceHash: string;
  value: string;
}

export interface NarrativeProposal {
  version: 1;
  kind: 'narrative-update-proposal';
  approved: false;
  owner: string;
  sheetId: string;
  expectedRevision: string;
  beforeHash: string;
  afterHash: string;
  /** 入力した本文JSON全体のhash。承認後に根拠ファイルが変わればこの値がずれる。 */
  evidenceHash: string;
  changes: NarrativeChange[];
  /** JSONに書かれたがシート側で一意に解決できなかったキー。黙って捨てない。 */
  unmatched: { projects: string[]; companies: string[] };
  blocks: RawDocumentBlock[];
  remainingIssues: DocumentIssue[];
}

function projectData(block: RawDocumentBlock): ProjectBlockData | null {
  if (!isBlockInput(block) || block.type !== 'project' || !record(block.data)) return null;
  const data = block.data as Partial<ProjectBlockData>;
  if (!Array.isArray(data.companies) || !Array.isArray(data.items)) return null;
  return data as ProjectBlockData;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 同じ表示名が複数ある場合は選ばせず失敗させる。解決結果だけをIDで返す。 */
function resolveUnique<T extends { id: string }>(matches: T[], label: string): T | null {
  if (matches.length === 0) return null;
  if (matches.length > 1) throw new Error(`AMBIGUOUS_NARRATIVE_TARGET: ${label}`);
  return matches[0];
}

export function proposeNarrativeUpdate(
  owner: string,
  snapshot: DocumentSnapshot,
  narrative: NarrativeFile,
): NarrativeProposal {
  if (!owner.trim() || !uuid.test(snapshot.sheetId) || !isRevision(snapshot.revision)) {
    throw new Error('INVALID_NARRATIVE_IDENTITY');
  }
  const before = {
    owner,
    sheetId: snapshot.sheetId,
    revision: snapshot.revision,
    title: snapshot.title,
    blocks: snapshot.blocks,
  };
  const blocks = structuredClone(snapshot.blocks);
  const changes: NarrativeChange[] = [];
  const unmatched = {
    projects: new Set(Object.keys(narrative.projects ?? {})),
    companies: new Set(Object.keys(narrative.companies ?? {})),
  };

  for (const block of blocks) {
    const data = projectData(block);
    if (!data) continue;

    for (const company of data.companies) {
      const patch = narrative.companies?.[company.name.trim()];
      if (!patch) continue;
      if (
        resolveUnique(
          data.companies.filter((c) => c.name.trim() === company.name.trim()),
          company.name,
        ) !== company
      )
        throw new Error(`AMBIGUOUS_NARRATIVE_TARGET: ${company.name}`);
      unmatched.companies.delete(company.name.trim());
      for (const field of COMPANY_NARRATIVE_FIELDS) {
        const value = patch[field];
        if (value === undefined || value === company[field]) continue;
        changes.push({
          blockId: block.id,
          targetId: company.id,
          targetKind: 'company',
          field,
          beforeHash: hashField(company[field]),
          afterHash: hash(value),
          evidenceHash: hash(patch),
          value,
        });
        company[field] = value;
      }
    }

    for (const item of data.items) {
      const patch = narrative.projects?.[item.title.trim()];
      if (!patch) continue;
      if (
        resolveUnique(
          data.items.filter((i) => i.title.trim() === item.title.trim()),
          item.title,
        ) !== item
      )
        throw new Error(`AMBIGUOUS_NARRATIVE_TARGET: ${item.title}`);
      unmatched.projects.delete(item.title.trim());
      for (const field of PROJECT_NARRATIVE_FIELDS) {
        const value = patch[field];
        if (value === undefined || value === item[field]) continue;
        changes.push({
          blockId: block.id,
          targetId: item.id,
          targetKind: 'project',
          field,
          beforeHash: hashField(item[field]),
          afterHash: hash(value),
          evidenceHash: hash(patch),
          value,
        });
        item[field] = value;
      }
    }
  }

  return {
    version: 1,
    kind: 'narrative-update-proposal',
    approved: false,
    owner,
    sheetId: snapshot.sheetId,
    expectedRevision: snapshot.revision,
    beforeHash: hash(before),
    afterHash: hash({ ...before, blocks }),
    evidenceHash: hash(narrative),
    changes,
    unmatched: { projects: [...unmatched.projects], companies: [...unmatched.companies] },
    blocks,
    remainingIssues: validateDocumentBlocks(blocks),
  };
}

export type { NarrativeProposal as Proposal };

/**
 * 保存済みchangesを現在のrawブロックへ適用する。
 * 対象の現在値が承認時のbeforeHashと違えば失敗する（誰かの後続変更を踏まない）。
 */
export function applyNarrativeChanges(
  blocks: readonly RawDocumentBlock[],
  changes: readonly NarrativeChange[],
): RawDocumentBlock[] {
  const next = structuredClone(blocks) as RawDocumentBlock[];
  for (const change of changes) {
    const block = next.find((b) => b.id === change.blockId);
    const data = block && projectData(block);
    if (!data) throw new Error(`NARRATIVE_TARGET_CHANGED: ${change.blockId}`);
    const list = change.targetKind === 'company' ? data.companies : data.items;
    const target = list.find((entry) => entry.id === change.targetId);
    if (!target) throw new Error(`NARRATIVE_TARGET_CHANGED: ${change.targetId}`);
    const current = (target as unknown as Record<string, unknown>)[change.field];
    if (hashField(current) !== change.beforeHash) {
      throw new Error(`NARRATIVE_TARGET_CHANGED: ${change.targetId}.${change.field}`);
    }
    (target as unknown as Record<string, unknown>)[change.field] = change.value;
  }
  return next;
}

/**
 * 承認ハッシュと現在文書を照合する。承認自体はこの関数では作らない。
 * beforeが進んでいたり案が改変されていたりすれば拒否し、一致した案だけを返す。
 */
export function verifyNarrativeProposal(
  owner: string,
  current: DocumentSnapshot,
  proposal: NarrativeProposal,
  approvedHashes: { beforeHash: string; afterHash: string },
): NarrativeProposal {
  if (!owner.trim() || !uuid.test(current.sheetId) || !isRevision(current.revision)) {
    throw new Error('INVALID_NARRATIVE_IDENTITY');
  }
  if (proposal.kind !== 'narrative-update-proposal' || proposal.owner !== owner) {
    throw new Error('STALE_OR_CHANGED_NARRATIVE');
  }
  const freshBefore = {
    owner,
    sheetId: current.sheetId,
    revision: current.revision,
    title: current.title,
    blocks: current.blocks,
  };
  if (
    proposal.sheetId !== current.sheetId ||
    proposal.expectedRevision !== current.revision ||
    proposal.beforeHash !== hash(freshBefore)
  ) {
    throw new Error('STALE_OR_CHANGED_NARRATIVE');
  }
  const rebuilt = applyNarrativeChanges(current.blocks, proposal.changes);
  if (
    canonicalJson(rebuilt) !== canonicalJson(proposal.blocks) ||
    hash({ ...freshBefore, blocks: rebuilt }) !== proposal.afterHash
  ) {
    throw new Error('STALE_OR_CHANGED_NARRATIVE');
  }
  if (approvedHashes.beforeHash !== proposal.beforeHash || approvedHashes.afterHash !== proposal.afterHash) {
    throw new Error('NARRATIVE_APPROVAL_MISMATCH');
  }
  if (proposal.remainingIssues.length > 0) throw new Error('UNRESOLVED_DOCUMENT_ISSUES');
  return proposal;
}

/** 承認記録へ載せるのはhash束縛だけ。本文値はproposal側にだけ残す。 */
export function narrativeApprovalChanges(changes: readonly NarrativeChange[]) {
  return changes.map(({ value: _value, ...rest }) => rest);
}
