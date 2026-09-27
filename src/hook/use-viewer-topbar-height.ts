import { useEffect, useRef } from 'react';

/**
 * スティッキーヘッダーの実高を CSS 変数 `--viewer-topbar-h` へ流すフック（#397）。
 *
 * ページ内の sticky 要素（会社見出し・目次サイドバー）のずらし量をこの変数で
 * 一元化する。ずらし量を各所へ直書きすると、ヘッダーの段数・パディングが変わる
 * たびに見出しがヘッダーへ潜るズレが再発する（390px で実測17pxの埋没があった）。
 * ビューア系のヘッダー（ViewerTopbar / レガシー Header）の両方で呼ぶ。
 */
export function useViewerTopbarHeight<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      document.documentElement.style.setProperty('--viewer-topbar-h', `${el.offsetHeight}px`);
    };
    update();
    // jsdom 等 ResizeObserver が無い環境では初期値だけ書いて終える。
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return ref;
}
