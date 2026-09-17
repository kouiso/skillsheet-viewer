/** 強調記法の変更案を作る。DB適用は承認journal経路への移行後に行う。 */
import { createHash } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isProjectBlockData } from '../src/db/block';
import { getDb } from '../src/db/client';
import { canonicalJson, type RawDocumentBlock } from '../src/db/document-contract';
import { createDocumentService } from '../src/db/document-service';
import { getOwnerId } from '../src/db/skillsheet';
import { unwrapEmphasis } from '../src/db/text';
import { loadScriptEnv } from './env';

const fields = ['summary', 'duties', 'acquired', 'comment'] as const;
export interface UnwrapChange {
  blockId: string;
  projectId: string;
  field: (typeof fields)[number];
  beforeHash: string;
  afterHash: string;
}
const hash = (value: string) => createHash('sha256').update(canonicalJson(value)).digest('hex');

/** UUIDと未対象fieldを保持し、同タイトル案件を混同しない。 */
export function proposeUnwrap(blocks: readonly RawDocumentBlock[]) {
  const changes: UnwrapChange[] = [];
  const proposed = blocks.map((block): RawDocumentBlock => {
    if (block.type !== 'project' || !isProjectBlockData(block.data)) return block;
    const items = block.data.items.map((item) => {
      const next = { ...item };
      for (const field of fields) {
        const before = item[field];
        if (typeof before !== 'string') continue;
        const after = unwrapEmphasis(before);
        if (after === before) continue;
        next[field] = after;
        changes.push({
          blockId: block.id,
          projectId: item.id,
          field,
          beforeHash: hash(before),
          afterHash: hash(after),
        });
      }
      return next;
    });
    return { ...block, data: { ...block.data, items } };
  });
  return { blocks: proposed, changes };
}

export function parseUnwrapArgs(args: string[]): string {
  if (args.includes('--write')) throw new Error('LEGACY_WRITER_DISABLED: 承認journalによる反映が必要です');
  if (
    args.length !== 2 ||
    args[0] !== '--sheet-id' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args[1])
  ) {
    throw new Error('--sheet-id UUID が必要です');
  }
  return args[1];
}

async function main() {
  const sheetId = parseUnwrapArgs(process.argv.slice(2));
  loadScriptEnv();
  const owner = getOwnerId();
  const result = await createDocumentService(getDb(), owner).read(sheetId);
  if (result.status !== 'OK') throw new Error(result.status);
  const before = result.snapshot;
  const proposal = proposeUnwrap(before.blocks);
  const directory = join(
    process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'),
    'skillsheet-viewer',
    'proposals',
    'unwrap',
  );
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${sheetId}-${before.revision}-${Date.now()}.json`);
  const fd = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(fd, canonicalJson({ owner, before, proposal, approved: false }));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  console.log(`proposal saved: ${proposal.changes.length} fields; DB unchanged`);
  console.log(path);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(() => {
    console.error('unwrap proposal failed');
    process.exitCode = 1;
  });
}
