import { isBlockInputEmpty, splitMarkdownIntoBlocks } from '../src/blocks';
import { createSheet, deleteSheet, fetchMarkdownFromGitHub, getGitHubSeedConfig, listSheets } from '../src/skillsheet';
import { loadScriptEnv } from './env';

loadScriptEnv({ required: true });

const SHEET_TITLE = 'エンジニアスキルシート';

async function main() {
  const config = getGitHubSeedConfig();
  if (!config) {
    throw new Error('GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO が未設定です');
  }

  console.log(`Fetching ${config.owner}/${config.repo}/skillsheet.md ...`);
  const markdown = await fetchMarkdownFromGitHub({ ...config, filePath: 'skillsheet.md' });
  // 分割で生じる空白のみのセグメントは分割ノイズなので除く（createSheet はもう
  // 空ブロックを落とさないため、ここで意図的にフィルタする必要がある。issue #128）。
  const segments = splitMarkdownIntoBlocks(markdown).filter((data) => !isBlockInputEmpty({ type: 'markdown', data }));
  console.log(`Split into ${segments.length} markdown blocks`);

  const blockInputs = segments.map((data) => ({ type: 'markdown' as const, data }));

  // 既存の同タイトルシートを削除して重複を防ぐ
  const existing = (await listSheets()).find((s) => s.title === SHEET_TITLE);
  if (existing) {
    console.log(`Deleting existing sheet ${existing.id}`);
    await deleteSheet(existing.id);
  }

  const sheetId = await createSheet(SHEET_TITLE, blockInputs);
  console.log(`Created sheet: ${sheetId}`);
  console.log(`View URL: /view/db/${sheetId}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
