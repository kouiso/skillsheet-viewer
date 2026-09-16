/**
 * 出力の「版」（edition）の共有定義。
 *
 * 全文版（full）に加えて要約版（digest）を出せるよう、PDF・Excel・テレメトリで
 * 同じ判別子を使い回す。値の追加はリテラルの同時追加で済ませたいので
 * `as const` 配列から型を引き、曖昧な string を流せない形にしておく。
 */

export const EXPORT_EDITIONS = ['full', 'digest'] as const;

export type ExportEdition = (typeof EXPORT_EDITIONS)[number];

export const DIGEST_TITLE_SUFFIX = '（要約版）';

export const digestTitle = (title: string) => `${title}${DIGEST_TITLE_SUFFIX}`;
