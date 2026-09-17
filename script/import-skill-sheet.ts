import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isBlockInputEmpty, splitMarkdownIntoBlocks } from '../src/db/block';
import { getDb } from '../src/db/client';
import { createDocumentService } from '../src/db/document-service';
import { fetchMarkdownFromGitHub, getGitHubSeedConfig, getOwnerId } from '../src/db/skillsheet';
import { prepareCreateOperation } from './create-operation';
import { loadScriptEnv } from './env';

const SHEET_TITLE = 'エンジニアスキルシート';

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length !== 2 ||
    args[0] !== '--operation-id' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args[1])
  ) {
    throw new Error('--operation-id UUID が必要です。同じ操作の再試行では同じIDを使ってください');
  }
  loadScriptEnv({ required: true });
  const owner = getOwnerId();
  const config = getGitHubSeedConfig();
  if (!config) {
    throw new Error('GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO が未設定です');
  }

  console.log(`Fetching ${config.owner}/${config.repo} ...`);
  // ファイルパスは fetchMarkdownFromGitHub が GITHUB_FILE_PATH から解決する。
  // 引数に filePath を足しても受け取り口が無く、黙って無視されていた。
  const markdown = await fetchMarkdownFromGitHub(config);
  // 分割で生じる空白のみのセグメントは分割ノイズなので除く（createSheet はもう
  // 空ブロックを落とさないため、ここで意図的にフィルタする必要がある。issue #128）。
  const segments = splitMarkdownIntoBlocks(markdown).filter((data) => !isBlockInputEmpty({ type: 'markdown', data }));
  console.log(`Split into ${segments.length} markdown blocks`);

  const blockInputs = segments.map((data) => ({ type: 'markdown' as const, data }));

  // 同名の既存文書は削除しない。再importは明示的な新規操作とする。
  const operationPath = join(
    process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'),
    'skillsheet-viewer',
    'operations',
    `${args[1].toLowerCase()}.json`,
  );
  const operation = prepareCreateOperation(operationPath, owner, SHEET_TITLE, blockInputs);
  const snapshot = await createDocumentService(getDb(), owner).create(
    operation.sheetId,
    operation.title,
    operation.blocks,
  );
  const sheetId = snapshot.sheetId;
  console.log(`Created sheet: ${sheetId}`);
  console.log(`View URL: /view/db/${sheetId}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(() => {
    console.error('import failed; 作成操作と接続設定を確認してください');
    process.exitCode = 1;
  });
}
