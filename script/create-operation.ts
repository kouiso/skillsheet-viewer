import { randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { BlockInput } from '../src/db/block';
import { canonicalJson, type RawDocumentBlock, validateDocumentBlocks } from '../src/db/document-contract';

export interface CreateOperation {
  version: 1;
  owner: string;
  sheetId: string;
  title: string;
  blocks: RawDocumentBlock[];
}

/** DB呼出し前に作成UUIDと内容をdurable化する。既存操作の内容を上書きしない。 */
export function prepareCreateOperation(
  path: string,
  owner: string,
  title: string,
  blocks: BlockInput[],
): CreateOperation {
  if (!owner) throw new Error('OWNER_REQUIRED');
  const expected = canonicalJson({ title, blocks });
  function load(): CreateOperation {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) {
        throw new Error('PRIVATE_OPERATION_REQUIRED');
      }
      const operation = JSON.parse(readFileSync(fd, 'utf8')) as CreateOperation;
      if (
        operation.version !== 1 ||
        operation.owner !== owner ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operation.sheetId) ||
        !Array.isArray(operation.blocks) ||
        validateDocumentBlocks(operation.blocks).length
      ) {
        throw new Error('INVALID_CREATE_OPERATION');
      }
      if (
        canonicalJson({
          title: operation.title,
          blocks: operation.blocks.map(({ type, data }) => ({ type, data })),
        }) !== expected
      ) {
        throw new Error('CREATE_OPERATION_CONTENT_CHANGED');
      }
      return operation;
    } finally {
      closeSync(fd);
    }
  }
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const directoryFd = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(directoryFd);
    if ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid()))
      throw new Error('PRIVATE_OPERATION_DIRECTORY_REQUIRED');
  } finally {
    closeSync(directoryFd);
  }
  const operation: CreateOperation = {
    version: 1,
    owner,
    sheetId: randomUUID(),
    title,
    blocks: blocks.map((block, order) => ({ ...block, id: randomUUID(), order })),
  };
  if (validateDocumentBlocks(operation.blocks).length) throw new Error('UNEDITABLE_DOCUMENT');
  let fd: number;
  try {
    fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return load();
    throw error;
  }
  try {
    writeFileSync(fd, canonicalJson(operation));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  const syncFd = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    fsyncSync(syncFd);
  } finally {
    closeSync(syncFd);
  }
  return operation;
}
