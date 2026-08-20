// *.node.test.tsx から参照する実フォントファイルの絶対パス。
//
// なぜ import.meta.url 基準なのか: process.cwd() 基準だと、cwd をどこに置いて
// vitest を起動したかで解決先が変わり ENOENT で落ちていた。
// このモジュール自身の位置からたどれば、どこを cwd にしても同じファイルを指す。
//
// Noto Sans JP の CFF(OTF) 版は @react-pdf/renderer のサブセット化が壊れて豆腐表示・
// コンテンツ消失を起こす（Issue #172）ため、テストも本番と同じ TrueType 版を使う。
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** public/fonts（このファイルは src/components/pdf にある）。 */
export const FONTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'public',
  'fonts',
);
export const REGULAR_TTF = path.join(FONTS_DIR, 'NotoSansJP-Regular.ttf');
export const BOLD_TTF = path.join(FONTS_DIR, 'NotoSansJP-Bold.ttf');
