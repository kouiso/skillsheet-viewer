import { pathToFileURL } from 'node:url';

import { runWithTransaction } from '@better-auth/core/context';
import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import { createDb } from '../src/db/client';
import { account, session, user, verification } from '../src/db/schema';
import { loadScriptEnv, parseEnvFile } from './env';

const USAGE = `使い方:
  pnpm exec tsx scripts/bootstrap-owner.ts --email=<email> [--name=<name>]

  --password を省略し対話端末（TTY）から実行すると、画面に表示されない対話プロンプトで
  パスワードを読み取る（推奨）。CI 等の非対話環境向けに --password=<password> 引数や
  環境変数 SKILLSHEET_OWNER_EMAIL / SKILLSHEET_OWNER_PASSWORD / SKILLSHEET_OWNER_NAME でも
  指定可能（CLI引数が優先。どちらもシェル履歴・ps に平文で残るリスクがある）。
  DATABASE_URL / BETTER_AUTH_SECRET はリポジトリルートの .env（無ければ .env.local）から読み込む。
  どちらも無くても、実行環境の環境変数に既に設定済みなら（CI/Vercel 等）そのまま使う。`;

// DATABASE_URL / BETTER_AUTH_SECRET を .env ファイルから読み込む。
//
// SETUP.md はリポジトリルートの `.env`（`cp .env.example .env`）を案内しているが、
// 他のスクリプトは `.env.local` を読む方式のみだった。この不一致で、
// SETUP.md の手順どおりに進めると「.env.local が見つかりません」で止まっていた
// （レビュー指摘）。両方の場所を候補にして先に見つかった方を使い、既存の process.env の
// 値は上書きしない。どちらの候補ファイルも無くても、必須の環境変数が実行環境
// （CI/Vercel 等）に既に設定済みなら、そのまま処理を継続する（ファイルが無いことだけを
// 理由に fail-fast しない）。
// テストが読み込み口として使っているので、共通実装をそのまま公開する。
export { parseEnvFile };

loadScriptEnv();

function parseArg(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

// --password 引数やコマンドと同じ行の環境変数指定（SKILLSHEET_OWNER_PASSWORD='...' pnpm ...）は
// どちらもシェル履歴・`ps` のプロセス引数一覧に平文で残ってしまう（レビュー指摘）。
// これを避けるため、対話端末（TTY）から実行され、かつ password が未指定の場合のみ
// エコーを抑制した対話プロンプトで読み取る。外部依存は追加せず、標準の stdin raw mode で実装する。
export function promptHiddenPassword(promptText: string, stdin: NodeJS.ReadStream = process.stdin): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) {
      reject(new Error('非対話環境のためパスワードの対話入力ができません'));
      return;
    }
    process.stdout.write(promptText);
    let input = '';
    const cleanup = () => {
      stdin.setRawMode?.(false);
      stdin.pause();
      stdin.removeListener('data', onData);
    };
    const onData = (chunk: Buffer | string) => {
      // ペースト入力やバッファリングにより、1回の data イベントに複数文字
      // （例: "Secret\r"）がまとめて届くことがある。chunk 全体を1つの文字列として
      // switch で厳密一致させると制御文字のケースに一致せず、Enter等がそのまま
      // パスワードへ追記されてしまう（レビュー指摘）ため。1文字ずつ処理する。
      for (const char of chunk.toString()) {
        switch (char) {
          case '\n':
          case '\r':
          case '\u0004': // Ctrl-D
            cleanup();
            process.stdout.write('\n');
            resolve(input);
            return;
          case '\u0003': // Ctrl-C
            cleanup();
            process.stdout.write('\n');
            reject(new Error('入力がキャンセルされました'));
            return;
          case '\u007f': // Backspace（多くの端末）
          case '\b':
            // input.slice(0, -1) はUTF-16コードユニット単位で末尾を削るため、
            // 絵文字等サロゲートペアが必要な符号点を含むパスワードでBackspaceを
            // 押すと下位サロゲートのみ消え、上位サロゲートが取り残される
            // （不可視の不正な符号列としてそのままハッシュ化され、ブラウザの
            // ログインフォームでは再現できないパスワードでアカウントが
            // 作成されてしまう。レビュー指摘）。スプレッド構文は符号点単位で
            // イテレートするため、これを使って末尾の1符号点を丸ごと削る。
            input = [...input].slice(0, -1).join('');
            break;
          default:
            input += char;
            break;
        }
      }
    };
    stdin.setEncoding('utf8');
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

// Better Auth（/sign-in/email）は zod の z.email() で検証しており、この正規表現と
// 同じものを使う（node_modules/zod の v4/core/regexes.js の email 定義）。ここで
// 弾かないと、`owner@example`（TLD無し）のような値でも user/account 行が作成され、
// 「作成成功」の出力が出るのに /login では Better Auth 側の検証で弾かれて
// ログインできない、という事故になる（レビュー指摘）。
export const EMAIL_PATTERN =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+.-]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

/** provisionOwner の結果。呼び出し側のログ文言を分岐するために何をしたかを返す。 */
export type ProvisionOwnerResult = {
  userId: string;
  action: 'created' | 'reissued' | 'linked';
};

/**
 * オーナーアカウントを用意する（新規作成 / パスワード再発行 / credential 行の補完）。
 *
 * main() から切り出してあるのは、この経路そのものをテストで動かすため。
 * 以前は純粋なヘルパ（parseEnvFile 等）しかテストしておらず、better-auth の
 * バージョン差でこの経路が丸ごと落ちても誰も気づけなかった（新規環境で
 * オーナーを作れず /builder に入れない状態が残った）。
 */
export async function provisionOwner(
  // $context は関数ではなく Promise プロパティ。ReturnType を二重に噛ませると
  // 型が解決できず、以降の ctx が暗黙 any に崩れる。
  ctx: Awaited<ReturnType<typeof betterAuth>['$context']>,
  params: { email: string; password: string; name: string },
): Promise<ProvisionOwnerResult> {
  const { password, name } = params;
  const normalizedEmail = params.email.toLowerCase();
  const minLen = ctx.password.config.minPasswordLength;
  const maxLen = ctx.password.config.maxPasswordLength;
  if (password.length < minLen || password.length > maxLen) {
    throw new Error(`パスワードの長さが不正です（${minLen}〜${maxLen}文字である必要があります）`);
  }

  const hash = await ctx.password.hash(password);
  // includeAccounts を付けないと existing.accounts が常に空配列になり、credential
  // アカウントの有無を判定できない（デフォルトで account は join されない）。
  const existing = await ctx.internalAdapter.findUserByEmail(normalizedEmail, { includeAccounts: true });

  if (existing?.user) {
    const userId = existing.user.id;
    const hasCredentialAccount = existing.accounts.some((a) => a.providerId === 'credential');
    if (hasCredentialAccount) {
      // 既存オーナーのパスワード再発行（dogfooding で実際に使ったユースケース）。
      // user.id は変わらないため SKILLSHEET_OWNER_ID の再設定は不要。
      await ctx.internalAdapter.updatePassword(userId, hash);
      return { userId, action: 'reissued' };
    }
    // user 行はあるが credential アカウントが無い（過去の実行が linkAccount で
    // 失敗したまま残った等）。updatePassword は対象の credential 行が無いと
    // 黙って0行更新のまま成功したように返るため、ここで判定して linkAccount で
    // 新規作成する。
    await ctx.internalAdapter.linkAccount({
      userId,
      providerId: 'credential',
      accountId: userId,
      password: hash,
    });
    return { userId, action: 'linked' };
  }

  // createUser と linkAccount を同一トランザクションで実行し、どちらかが失敗したら
  // 両方ロールバックする（以前は linkAccount 失敗時に user を補償削除していたが、
  // その削除自体が失敗すると credential の無い user だけが残る事故があった）。
  //
  // 以前はここで createInternalAdapter(tx, ctx) を組み立て直していたが、
  // better-auth 1.6.25 の `auth.$context` は `hooks` を公開しなくなったため
  // getWithHooks(adapter, ctx) の中で `ctx.hooks` が undefined になり
  // 「hooksEntries is not iterable」で必ず落ちていた（＝新規環境でオーナーを作れない）。
  //
  // ここは runWithTransaction を使う。`ctx.adapter.transaction(fn)` は fn にトランザクション
  // 用アダプタを引数で渡すだけで AsyncLocalStorage には積まないため、その中で
  // ctx.internalAdapter を呼んでも getCurrentAdapter() は素のアダプタへフォールバックし、
  // ロールバックが効かない（linkAccount が失敗すると user 行だけ残る）。
  // runWithTransaction は als.run でトランザクション用アダプタを積んでから fn を走らせる。
  const userId = await runWithTransaction(ctx.adapter, async () => {
    const createdUser = await ctx.internalAdapter.createUser({
      email: normalizedEmail,
      name,
      image: null,
      // 単一オーナー運用でありメール確認フローが存在しないため、最初から検証済みにする。
      emailVerified: true,
    });
    await ctx.internalAdapter.linkAccount({
      userId: createdUser.id,
      providerId: 'credential',
      accountId: createdUser.id,
      password: hash,
    });
    return createdUser.id;
  });
  return { userId, action: 'created' };
}

async function main() {
  const email = parseArg('email') ?? process.env.SKILLSHEET_OWNER_EMAIL;
  let password = parseArg('password') ?? process.env.SKILLSHEET_OWNER_PASSWORD;
  const name = parseArg('name') ?? process.env.SKILLSHEET_OWNER_NAME ?? 'Owner';

  if (!email) {
    console.error(USAGE);
    throw new Error('email が指定されていません');
  }
  if (!password && process.stdin.isTTY) {
    // --password 引数・環境変数のどちらも無ければ、対話端末からの実行時のみ
    // エコー抑制プロンプトで読み取る（シェル履歴・ps 一覧への平文露出を避ける）。
    password = await promptHiddenPassword('パスワードを入力してください（画面には表示されません）: ');
  }
  if (!password) {
    console.error(USAGE);
    throw new Error(
      'password が指定されていません（--password 引数、SKILLSHEET_OWNER_PASSWORD 環境変数、または対話プロンプトのいずれかで指定してください）',
    );
  }
  if (!EMAIL_PATTERN.test(email)) {
    // Better Auth 自身の /sign-in/email がこの形式を弾くため、ここで先に弾かないと
    // 「作成成功」の出力が出るのに実際は /login からログインできないオーナーができる。
    throw new Error(`email の形式が不正です: ${email}`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set（.env または .env.local を確認してください）');
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set（.env または .env.local を確認してください）');

  // src/lib/auth.ts と同じ最小構成（email/password のみ）。
  // このスクリプトは internalAdapter を直接叩くため disableSignUp の値自体は挙動に影響しない。
  // BetterAuthOptions で受けてから渡す。リテラルのまま渡すと betterAuth の型引数が
  // このリテラル型に狭まり、$context が provisionOwner の求める
  // PluginContext<BetterAuthOptions> と別物になって代入できない。
  const options: BetterAuthOptions = {
    secret,
    baseURL: process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(createDb(databaseUrl), {
      provider: 'pg',
      schema: { user, session, account, verification },
      // transaction: true を渡さないと better-auth の drizzleAdapter は
      // ctx.adapter.transaction を「コールバックをそのまま呼ぶだけ」の no-op に
      // フォールバックし、実DBトランザクションにならない（下の createUser/linkAccount の
      // ロールバック保証が成立しない）。
      transaction: true,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      disableSignUp: true,
    },
  };
  const auth = betterAuth(options);

  const ctx = await auth.$context;
  const { userId, action } = await provisionOwner(ctx, { email, password, name });
  // CI から実行されうるので、メールアドレスはログに残さない（CI ログは長期に保存される）。
  // 必要な user.id は下の案内でだけ出す。
  console.log(
    action === 'created'
      ? 'オーナーアカウントを作成しました'
      : action === 'reissued'
        ? '既存ユーザーのパスワードを再発行しました'
        : '既存ユーザーに credential アカウントを作成しパスワードを設定しました',
  );

  console.log('');
  console.log('この user.id を .env（および Vercel の環境変数）の SKILLSHEET_OWNER_ID に設定してください:');
  console.log(userId);
}

// import.meta.url を直接実行チェックに使う。テストからこのモジュールを import した
// ときに main()（実DB接続・Better Auth 初期化）が副作用として走らないようにする。
// `file://${process.argv[1]}` の文字列連結は、Windows のパス区切り（`\`）や
// スペース等のURLエスケープ対象文字を含むパスで import.meta.url（正規化された
// file: URL）と一致しなくなり、main() が実行されないままコマンドが黙って正常終了
// してしまう（レビュー指摘）。pathToFileURL で同じ正規化を経てから比較する。
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
