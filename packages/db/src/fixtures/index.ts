/**
 * 検証・デモ用のフィクスチャ。**本番の読み込み口（`@skillsheet/db`）には載せない。**
 * 載せていた頃は、閲覧画面のバンドルに検証専用のデータ生成コードが混ざる余地があった。
 * 利用側は `@skillsheet/db/fixtures` から読む（seed スクリプトと E2E だけ）。
 */
export * from './console-demo';
export * from './real-volume-demo';
