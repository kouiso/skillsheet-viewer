/**
 * 公開エントリポイント（`@skillsheet/db/blocks`）。実体は ./blocks/ 配下に分割されている。
 * `packages/db/package.json` の exports で `./blocks` はこのファイルを指しているため、
 * 外部からの読み込み口・エクスポート名を変えないよう、ここでは再エクスポートのみ行う。
 */
export * from './blocks/index';
