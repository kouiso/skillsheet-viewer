/**
 * Google の外部スクリプト（GIS・gapi）を 1 回だけ読み込む。
 * 画面を開いた時点で呼び、ボタンを押す前に読み込みを終わらせる設計
 * （ポップアップブロッカー回避のため、トークン要求はクリックと同期的に行う
 * 必要があり、クリック時にスクリプト読み込み待ちを挟めない）。
 */

const pending = new Map<string, Promise<void>>();

/** 同じ src は一度だけ読み込む。失敗した promise は捨てて次回再試行できる。 */
export function loadScriptOnce(src: string): Promise<void> {
  const cached = pending.get(src);
  if (cached) return cached;

  const promise = new Promise<void>((resolve, reject) => {
    // HMR・別経路（他の機能）で既に読み込まれている場合は再挿入しない。
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      // 失敗をキャッシュに残すとリロードしない限り復帰不能になるため消す。
      pending.delete(src);
      reject(new Error(`スクリプトの読み込みに失敗しました: ${src}`));
    };
    document.head.appendChild(el);
  });

  pending.set(src, promise);
  return promise;
}

/** テスト用: 読み込み状態をリセットする。 */
export function resetLoadedScriptsForTest(): void {
  pending.clear();
}
