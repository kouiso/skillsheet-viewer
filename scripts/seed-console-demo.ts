/** 操作UUIDを指定してconsole検証シートを作成する。同じ操作の再試行では同じUUIDを使う。 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb } from '../src/db/client';
import { createDocumentService } from '../src/db/document-service';
import { buildConsoleDemoBlocks, CONSOLE_DEMO_TITLE } from '../src/db/fixtures/console-demo';
import { getOwnerId } from '../src/db/skillsheet';
import { prepareCreateOperation } from './create-operation';
import { loadScriptEnv } from './env';

export async function seedConsoleDemo(args: string[]): Promise<string> {
  if (
    args.length !== 2 ||
    args[0] !== '--operation-id' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args[1])
  )
    throw new Error('--operation-id UUID が必要です。同じ操作の再試行では同じIDを使ってください');
  loadScriptEnv({ required: true });
  const owner = getOwnerId();
  const operation = prepareCreateOperation(
    join(
      process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'),
      'skillsheet-viewer',
      'operations',
      `${args[1].toLowerCase()}.json`,
    ),
    owner,
    CONSOLE_DEMO_TITLE,
    buildConsoleDemoBlocks(),
  );
  const snapshot = await createDocumentService(getDb(), owner).create(
    operation.sheetId,
    operation.title,
    operation.blocks,
  );
  return snapshot.sheetId;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  seedConsoleDemo(process.argv.slice(2))
    .then((sheetId) => {
      console.log(`Created sheet: ${sheetId}`);
      console.log(`URL: /view/db/${sheetId}`);
    })
    .catch(() => {
      console.error('console demo作成失敗: 操作IDと接続設定を確認してください');
      process.exitCode = 1;
    });
}
