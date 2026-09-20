import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { neonConfig, Pool } from '@neondatabase/serverless';
import ws from 'ws';

import { loadScriptEnv, parseEnvFile } from './env';

const USAGE = `使い方:
  DATABASE_URL=<e2e DB URL> pnpm exec tsx script/reset-e2e-db.ts

  e2e 専用 DB を実行ごとに「まっさら」へ戻す（#360）。標準の経路は
  データベース自体の DROP + CREATE で、extension・grant・ drizzle 進捗表を含む
  全状態を消す。接続 role に CREATEDB が無い等で DB 単位の作り直しができない
  環境向けに、スキーマ（public / drizzle / skillsheet_private）の DROP CASCADE +
  public 再作成へ自動でフォールバックする —— 本アプリの全オブジェクトは
  スキーマ配下に収まるため、どちらの経路でも「次の migrate + boundary install が
  新規環境と同じ状態で通る」という結果は同じになる。

  接続情報は環境変数 E2E_DATABASE_URL を優先し、無ければ DATABASE_URL を使う。
  ファイルからは .env / .env.local / .env.e2e をこの順で読む（既存の環境変数は
  上書きしない）。`;

// src/db/client.ts と同じく、Node 環境で serverless ドライバが WebSocket を
// 張れるよう `ws` を差し込む。
if (!neonConfig.webSocketConstructor) {
  neonConfig.webSocketConstructor = ws;
}

/**
 * 接続 URL からデータベース名を取り出す。クエリ（sslmode 等）は含めない。
 * URL パースに失敗した場合・dbname が空の場合は例外。
 */
export function extractDatabaseName(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!name) {
    throw new Error(`DATABASE_URL にデータベース名がありません: ${url.origin}`);
  }
  return name;
}

/**
 * リセット対象が e2e 専用 DB であることを名前で強制する。
 * このスクリプトは破壊的（DROP DATABASE）なので、正本 `neondb` や保守 DB を
 * 誤って渡しても必ず止まるようにする。e2e DB の命名規約は `_e2e` サフィックス
 * （現在は `skillsheet_e2e`）。
 */
export function assertE2eDatabaseName(dbName: string): void {
  if (dbName === 'neondb' || dbName === 'postgres' || dbName.startsWith('template')) {
    throw new Error(`refuse to reset non-e2e database: ${dbName}`);
  }
  if (!dbName.endsWith('_e2e')) {
    throw new Error(`refuse to reset database "${dbName}": e2e 専用 DB は *_e2e で終わる名前だけが対象です`);
  }
}

/** 識別子の SQL 引用。dbname は URL 由来のため必ずここを通す。 */
export function quoteIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

/**
 * DROP/CREATE DATABASE は対象 DB へ接続したまま実行できないため、同じエンド
 * ポイントの別データベース（保守 DB）へ切り替えた URL を作る。Neon の既定では
 * `neondb` が存在する。
 */
export function buildMaintenanceUrl(databaseUrl: string, maintenanceDb: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${maintenanceDb}`;
  return url.toString();
}

async function dropAndRecreateDatabase(maintenanceUrl: string, dbName: string): Promise<void> {
  const pool = new Pool({ connectionString: maintenanceUrl, max: 1 });
  try {
    // WITH (FORCE) は PG13+。残った接続（前回 run の webServer 等）を server 側で
    // 切断させる。トランザクション内では実行できないため単発クエリとして流す。
    await pool.query(`DROP DATABASE IF EXISTS ${quoteIdent(dbName)} WITH (FORCE)`);
    await pool.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
  } finally {
    await pool.end();
  }
}

export async function resetSchemas(pool: Pool): Promise<void> {
  // DB 単位の作り直しが使えない環境向けの縮退経路。アプリの全オブジェクト
  // （public のテーブル群、drizzle.__drizzle_migrations、skillsheet_private の
  // 境界オブジェクト）はスキーマ配下なので、これだけで論理上の新規 DB と同等に
  // なる。cluster 全域共有の role はここでは触らない。
  await pool.query('DROP SCHEMA IF EXISTS skillsheet_private CASCADE');
  await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  // Neon の既定と揃える（PG15+ では public への PUBLIC CREATE は剥がされているが、
  // Neon は利用しやすさのため付与している）。e2e 専用 DB のみで効く。
  await pool.query('GRANT USAGE, CREATE ON SCHEMA public TO PUBLIC');
}

async function main(): Promise<void> {
  loadScriptEnv();

  // playwright.config.ts と同じ規則で .env.e2e も読む。E2E_DATABASE_URL は
  // ここに置く運用のため（既存の環境変数は上書きしない）。
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const e2eEnvPath = resolve(repoRoot, '.env.e2e');
  if (existsSync(e2eEnvPath)) {
    for (const [key, value] of Object.entries(parseEnvFile(readFileSync(e2eEnvPath, 'utf-8')))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }

  const databaseUrl = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(`${USAGE}\n\nE2E_DATABASE_URL / DATABASE_URL が未設定です`);
  }

  const dbName = extractDatabaseName(databaseUrl);
  assertE2eDatabaseName(dbName);

  // DROP DATABASE は対象 DB に接続したまま打てないため、同一エンドポイントの
  // 保守 DB 経由で実行する。Neon 既定の neondb を先に試し、無い環境（ローカル
  // 検証等）では postgres / template1 を順に試す。保守 DB のデータには触れず、
  // 発行するのは対象 e2e DB の DROP/CREATE のみ。
  for (const maintenanceDb of ['neondb', 'postgres', 'template1']) {
    try {
      await dropAndRecreateDatabase(buildMaintenanceUrl(databaseUrl, maintenanceDb), dbName);
      console.log(`e2e DB を作り直しました（DROP+CREATE via ${maintenanceDb}）: ${dbName}`);
      return;
    } catch (error) {
      // 保守 DB 非存在（3D000）や権限不足（42501）は次候補/フォールバックへ。
      const code = (error as { code?: string }).code;
      if (code !== '3D000' && code !== '42501') throw error;
    }
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await resetSchemas(pool);
  } catch (error) {
    // 「DROP は通ったが CREATE が権限不足」という組合せ（owner だが CREATEDB
    // 無し等）では e2e DB が既に存在しない。そのまま接続エラーだけを返すと
    // 原因が読めないため、復旧手順を含むエラーに置き換える。
    if ((error as { code?: string }).code === '3D000') {
      throw new Error(
        `e2e DB "${dbName}" が存在しません。DROP 後の CREATE DATABASE に失敗した可能性があります —— 接続 role に CREATEDB を付与するか、DB を手動で作り直してください`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    await pool.end();
  }
  console.log(`e2e DB のスキーマをリセットしました（schema drop+recreate）: ${dbName}`);
}

// bootstrap-owner.ts と同じ直接実行チェック。テスト import 時に main() が
// 走らないようにする。
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
