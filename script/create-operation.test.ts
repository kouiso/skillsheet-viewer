import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareCreateOperation } from './create-operation';

const dirs: string[] = [];
function file() {
  const dir = mkdtempSync(join(tmpdir(), 'create-operation-'));
  dirs.push(dir);
  return join(dir, 'operation.json');
}
const blocks = [{ type: 'markdown' as const, data: { markdown: '原文\n' } }];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
describe('durable create operation', () => {
  it('persists IDs before returning and reuses all IDs on retry', () => {
    const path = file();
    const first = prepareCreateOperation(path, 'owner', 'T', blocks);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(first);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(prepareCreateOperation(path, 'owner', 'T', blocks)).toEqual(first);
  });
  it('does not replace an existing operation when source or owner changes', () => {
    const path = file();
    prepareCreateOperation(path, 'owner', 'T', blocks);
    const before = readFileSync(path, 'utf8');
    expect(() => prepareCreateOperation(path, 'owner', 'changed', blocks)).toThrow('CREATE_OPERATION_CONTENT_CHANGED');
    expect(() => prepareCreateOperation(path, 'other', 'T', blocks)).toThrow('INVALID_CREATE_OPERATION');
    expect(readFileSync(path, 'utf8')).toBe(before);
  });
  it('fails closed on partial files and rejects permissive file modes', () => {
    const path = file();
    writeFileSync(path, '{', { mode: 0o600 });
    expect(() => prepareCreateOperation(path, 'owner', 'T', blocks)).toThrow();
    chmodSync(path, 0o644);
    expect(() => prepareCreateOperation(path, 'owner', 'T', blocks)).toThrow('PRIVATE_OPERATION_REQUIRED');
  });
  it('refuses symlinks without modifying their target', () => {
    const path = file();
    const target = `${path}.target`;
    writeFileSync(target, 'keep', { mode: 0o600 });
    symlinkSync(target, path);
    expect(() => prepareCreateOperation(path, 'owner', 'T', blocks)).toThrow();
    expect(readFileSync(target, 'utf8')).toBe('keep');
  });
});
