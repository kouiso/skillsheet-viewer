import { defaultSchema } from 'rehype-sanitize';
import remarkBreaks from 'remark-breaks';
import remarkCjkFriendly from 'remark-cjk-friendly';
import remarkGfm from 'remark-gfm';

// ページ本文（skill-sheet-viewer）・案件カードの短文フィールド（project-card）など、
// react-markdown を使う全ての箇所が共有する remark/rehype 設定。
// サニタイズ設定を1箇所に集約し、描画経路ごとに緩さが揺れないようにする。

// img src として許可するURLスキーム。http/https/相対パスのみ通し、
// javascript: や data: 等は除外して XSS を防ぐ。
export const MARKDOWN_IMG_SRC_PROTOCOLS = ['http', 'https'] as const;

// src が http(s) または相対パスかを判定する（javascript:/data: 等を拒否）。
export const isSafeImageSrc = (src: string): boolean => {
  // 相対パス（スキームを持たない）は許可する。
  if (!/^[a-z][a-z0-9+.-]*:/i.test(src)) return true;
  return MARKDOWN_IMG_SRC_PROTOCOLS.some((p) => src.toLowerCase().startsWith(`${p}:`));
};

// リンク href として許可するURLスキーム。rehype-sanitize の既定値をそのまま使い、
// 画面（rehype-sanitize が href を落とす）と PDF（後述の isSafeLinkHref）で
// 同じ判定になるようにする。
export const MARKDOWN_LINK_HREF_PROTOCOLS: readonly string[] = defaultSchema.protocols?.href ?? [
  'http',
  'https',
  'mailto',
  'tel',
];

/**
 * href が安全なスキームか（または相対パスか）を判定する。
 *
 * 画面側は rehype-sanitize が `javascript:` 等の href を属性ごと落とすが、PDF 側の
 * `<Link src>` はそのまま PDF の URI アクションになる。案件の自由記述（duties /
 * acquired / comment）が markdown として通るようになった以上、PDF だけ素通しだと
 * 第三者へ渡す成果物に `javascript:` / `file:` のクリック注釈が焼き付く。
 */
export const isSafeLinkHref = (href: string): boolean => {
  const trimmed = href.trim();
  if (trimmed === '') return false;
  // 相対パス・アンカー（スキームを持たない）は許可する。
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return true;
  return MARKDOWN_LINK_HREF_PROTOCOLS.some((p) => trimmed.toLowerCase().startsWith(`${p}:`));
};

// rehype-raw が有効化する生HTML描画を details/summary タグに限定する。
// style属性はデフォルトスキーマで除外済み（XSS防止）。
// img の src は http/https/相対パスのみ許可し、javascript:/data: 等を除外する。
// <script> はデフォルトスキーマの strip リストに含まれており、タグとその子テキストが
// 除去される。これを外すと未知タグと同じ「子孫を残した unwrap」扱いになり、
// alert(1) 等の危険な文字列が画面に漏れるので、strip は維持する。
export const MARKDOWN_SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary'],
  attributes: {
    ...defaultSchema.attributes,
    details: ['open'],
  },
  protocols: {
    ...defaultSchema.protocols,
    src: [...MARKDOWN_IMG_SRC_PROTOCOLS],
  },
};

// remark プラグイン配列はモジュールスコープで固定し、毎レンダーの新規生成を防ぐ。
//
// remarkCjkFriendly: CommonMark の flanking 規則（強調 `**`/`*` の直前直後が空白・約物
// でないと強調と認識しない）は日本語の文章と噛み合わない。和文直後に `**強調**` が続き、
// 直後が句読点等の約物だと強調と見なされず、アスタリスクがそのまま表示されてしまう
// （実データで確認: 「すべて**.htaccess**で記載」が画面にアスタリスクごと出る、#138）。
// CJK 向けに flanking 規則を緩めるプラグインを挟んで解決する。
export const MARKDOWN_REMARK_PLUGINS = [remarkGfm, remarkBreaks, remarkCjkFriendly];

// PDF は remark-breaks を入れない。単独改行を <br> にすると @react-pdf の Text 内 \n と
// 重なって文字が重なる（D社本文で再現）。GFM と CJK 強調はビューアと同じにする。
export const PDF_REMARK_PLUGINS = [remarkGfm, remarkCjkFriendly];
