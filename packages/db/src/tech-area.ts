/**
 * 案件の「技術領域」を、その案件に書かれている技術スタックだけから導出する表示専用ユーティリティ。
 *
 * このアプリの価値は「手元のスキルシートを取り込んだら読みやすくなる」ことにある。
 * 元シートに無い文言を生成して保存すると、そこから先はシートと表示が食い違い、
 * 本人が気づけないまま嘘が載る。だから導出結果は DB に保存せず、描画のたびに計算する。
 * （`process.ts` の工程正規化と同じ方針。）
 *
 * 判定材料は `lang` / `fw` / `infra` に**書かれた技術名だけ**。案件本文・タイトル・役割の
 * 文章は一切読まない。文章から推測を始めると、シートごとに当たり外れが出て検証もできなくなる。
 *
 * 呼ぶ名前を「担当領域」ではなく「技術領域」にしているのも同じ理由で、
 * 「この技術を使った」は書いてある事実だが「この領域を担当した」は書かれていないため。
 */

import type { ProjectTech } from './blocks';

interface AreaRule {
  area: string;
  /** 小文字化した技術名に対する部分一致キーワード。 */
  keys: string[];
  /**
   * 部分一致では誤検出する短いキー。語単位の完全一致だけを根拠にする。
   *
   * 例: `gin` を部分一致で見ると `Vite plugin` が、`echo` は `Echobot` が
   * 「バックエンド」に化ける。書いていない領域を出さないため、ここは語境界で判定する。
   */
  exactKeys?: string[];
}

// 部分一致にしているのは、実際のシートが "Next.js 15 (App Router)" や
// "AWS (ECS / ECR, RDS)" のようにバージョンや内訳込みで書かれるため。
const AREA_RULES: AreaRule[] = [
  {
    area: 'iOS',
    keys: ['swift', 'objective-c', 'uikit', 'xcode', 'ios', 'react native', 'flutter', 'expo', 'cordova', 'ionic'],
  },
  {
    area: 'Android',
    keys: ['kotlin', 'android', 'react native', 'flutter', 'expo', 'cordova', 'ionic'],
  },
  {
    area: 'Web',
    keys: [
      'react',
      'next.js',
      'nextjs',
      'vue',
      'nuxt',
      'angular',
      'svelte',
      'astro',
      'jquery',
      'wordpress',
      'html',
      'scss',
      'sass',
      'tailwind',
      'mui',
      'bootstrap',
      'css',
    ],
  },
  {
    area: 'バックエンド',
    keys: [
      'node',
      'express',
      'nest',
      'rails',
      'laravel',
      'cakephp',
      'django',
      'flask',
      'fastapi',
      'spring',
      '.net',
      'php',
      'graphql',
      'prisma',
      'typeorm',
      'sequelize',
      'hono',
      'grpc',
    ],
    exactKeys: ['gin', 'echo'],
  },
  {
    area: 'デスクトップ',
    keys: ['electron', 'tauri', 'cefsharp', 'wpf', 'winforms', 'qt'],
  },
  {
    // クラウド名だけでは「デプロイ先を書いた」のか「基盤を作った」のか区別できない。
    // AWS / GCP / Firebase を根拠にすると、修正案件までインフラ担当に見えてしまうため、
    // IaC・オーケストレーションの実在だけを根拠にする。
    area: 'インフラ',
    keys: ['terraform', 'kubernetes', 'ansible', 'ecspresso', 'cloudformation', 'pulumi', 'helm', 'hcl'],
  },
];

// "React Native" は React を含むが Web ではない。"React Hook Form" も同様に Web の根拠にしない
// （React 本体が別途書かれていれば、そちらで Web と判定される）。
const WEB_FALSE_POSITIVES = ['react native', 'react hook form'];

/**
 * 技術スタックから技術領域を導出する。該当が無ければ空配列。
 *
 * 順序は AREA_RULES の定義順で安定させる（案件ごとに並びが変わると読み手が比較できない）。
 */
export function deriveTechAreas(tech: ProjectTech | undefined): string[] {
  if (!tech) return [];
  const pool = [...(tech.lang ?? []), ...(tech.fw ?? []), ...(tech.infra ?? [])].map((t) => t.toLowerCase());
  return AREA_RULES.filter(({ area, keys, exactKeys }) =>
    pool.some((t) => {
      // 誤検出語は「その語だけ」を消して評価する。技術名まるごと評価対象外にすると、
      // `React Native + Tailwind` のような 1 セル記述で tailwind まで見落とす。
      const masked = area === 'Web' ? WEB_FALSE_POSITIVES.reduce((s, fp) => s.replaceAll(fp, ' '), t) : t;
      if (keys.some((k) => masked.includes(k))) return true;
      if (!exactKeys) return false;
      // 技術名の区切り（空白・記号）で分割し、語として一致する場合だけ根拠にする。
      const tokens = masked.split(/[^a-z0-9.+#]+/);
      return exactKeys.some((k) => tokens.includes(k));
    }),
  ).map(({ area }) => area);
}

/**
 * 表示用の技術領域の文字列。
 *
 * 元シートに担当領域の列があって取り込まれている場合（`item.scope`）はそちらを優先する。
 * インポートした値が常に導出より正しいため。空のときだけ技術スタックから導出する。
 */
export function projectAreaLabel(scope: string | undefined, tech: ProjectTech | undefined): string {
  const imported = scope?.trim();
  if (imported) return imported;
  return deriveTechAreas(tech).join(' / ');
}
