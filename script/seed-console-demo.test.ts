import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { prepareCreateOperation } from './create-operation';

// モジュールを再読込して、別プロセスでの再試行に相当するID生成を確認する。
describe('console fixtureの作成再試行', () => {
  it('再読込した原稿でも同じjournalとsheet UUIDを使える', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'console-operation-'));
    try {
      const first = await import('../src/db/fixture/console-demo');
      const operation = prepareCreateOperation(
        join(directory, 'operation.json'),
        'owner',
        first.CONSOLE_DEMO_TITLE,
        first.buildConsoleDemoBlocks(),
      );
      vi.resetModules();
      const second = await import('../src/db/fixture/console-demo');
      const retry = prepareCreateOperation(
        join(directory, 'operation.json'),
        'owner',
        second.CONSOLE_DEMO_TITLE,
        second.buildConsoleDemoBlocks(),
      );
      expect(retry).toEqual(operation);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('操作IDがなければ環境読込やDB作成へ進まない', async () => {
    const { seedConsoleDemo } = await import('./seed-console-demo');
    await expect(seedConsoleDemo([])).rejects.toThrow('--operation-id UUID');
    await expect(seedConsoleDemo(['--operation-id', '../wrong'])).rejects.toThrow('--operation-id UUID');
  });
});
