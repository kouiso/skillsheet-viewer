import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * スクリプトが読む .env の場所とパース規則を1か所に集める。
 *
 * 以前は 4 本のスクリプトがそれぞれ `../../../apps/web/.env.local` を直に書き、
 * パース処理も各自コピーしていた。そのせいで bootstrap-owner だけがリポジトリルートの
 * `.env` にも対応していて、SETUP.md の手順どおりに進めた人が他のスクリプトで
 * 「apps/web/.env.local が見つかりません」で止まる、という食い違いが起きていた。
 */

/** `KEY=value` 形式を読む。コメント行・空行・`=` の無い行は無視し、値のクォートは剥がす。 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/** 探す順番。SETUP.md が案内するリポジトリルートの `.env` を先に見る。 */
function envCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [resolve(here, '../../../.env'), resolve(here, '../../../apps/web/.env.local')];
}

/**
 * 見つかった .env をプロセスへ流し込む。既に設定済みの値は上書きしない
 * （CI / Vercel のように実行環境側で与えられている場合を壊さないため）。
 *
 * @param required true にすると、どの候補も無いときに例外を投げる。
 *   スクリプト本体は true、テストから import されうるモジュールは false を使う。
 * @returns 読み込んだファイルのパス。見つからなければ null。
 */
export function loadScriptEnv({ required = false }: { required?: boolean } = {}): string | null {
  const candidates = envCandidates();
  const envPath = candidates.find((p) => existsSync(p));
  if (!envPath) {
    if (required) {
      throw new Error(`.env が見つかりません（探した場所: ${candidates.join(' , ')}）`);
    }
    return null;
  }
  for (const [key, value] of Object.entries(parseEnvFile(readFileSync(envPath, 'utf-8')))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return envPath;
}
