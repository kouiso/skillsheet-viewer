/** D1 の必要最小インターフェース。SQL はこのサーバー内部だけに閉じる。 */
export interface D1Result {
  results: Record<string, unknown>[];
  success: boolean;
  meta: { changes: number };
}
export interface D1Statement {
  bind(...values: (string | number | null)[]): D1Statement;
  all(): Promise<D1Result>;
}
export interface D1Binding {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1Result[]>;
}
