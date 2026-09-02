import { useEffect, useRef } from 'react';

import { track } from '@/lib/observability/capture';
import type { SecondsBucket } from '@/lib/observability/event';

const THRESHOLDS = [25, 50, 75, 100] as const;

const SECONDS_BUCKETS: ReadonlyArray<{ maxMs: number; label: SecondsBucket }> = [
  { maxMs: 5_000, label: '0-5' },
  { maxMs: 15_000, label: '5-15' },
  { maxMs: 30_000, label: '15-30' },
  { maxMs: 60_000, label: '30-60' },
];

function secondsBucket(elapsedMs: number): SecondsBucket {
  const found = SECONDS_BUCKETS.find((b) => elapsedMs < b.maxMs);
  return found?.label ?? '60+';
}

function currentScrollPercent(): number {
  const doc = document.documentElement;
  const scrollable = doc.scrollHeight - doc.clientHeight;
  if (scrollable <= 0) return 100;
  return Math.min(100, Math.round(((window.scrollY + doc.clientHeight) / doc.scrollHeight) * 100));
}

/**
 * ページの読了度を 25/50/75/100% の到達時にそれぞれ1回だけ送る（1ページ最大4イベント）。
 * scroll イベントは高頻度で発火するため rAF で間引く。
 */
export function useReadDepth(enabled = true): void {
  const firedRef = useRef<Set<(typeof THRESHOLDS)[number]>>(new Set());
  const startedAtRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    // スクロール不要なほど短いページなら、初回判定で 100% がそのまま送れる。
    startedAtRef.current = performance.now();

    const checkDepth = () => {
      rafRef.current = null;
      const percent = currentScrollPercent();
      for (const threshold of THRESHOLDS) {
        if (percent >= threshold && !firedRef.current.has(threshold)) {
          firedRef.current.add(threshold);
          track({
            name: 'sheet_read_depth',
            depthPercent: threshold,
            secondsBucket: secondsBucket(performance.now() - startedAtRef.current),
          });
        }
      }
    };

    const onScroll = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(checkDepth);
    };

    // 未読込の画像は初期レイアウトの高さがほぼ0で、直後に判定すると「スクロール不要な
    // 短いページ」と誤認して 100% を早期発火してしまう（一度発火した閾値は撤回できない）。
    // 初回判定だけは読み込み完了まで待つ（読み込み済みなら即座に判定する）。
    let runInitialCheck = () => checkDepth();
    if (document.readyState === 'complete') {
      checkDepth();
      runInitialCheck = () => {};
    } else {
      window.addEventListener('load', runInitialCheck, { once: true });
    }

    // 遅延ロード画像やフォント差し替えなど、load 後もレイアウトが変わりうるケースを拾う
    // ための継続的な再判定（スクロールしなくても到達度が変わりうる）。
    const resizeObserver = new ResizeObserver(() => checkDepth());
    resizeObserver.observe(document.documentElement);

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('load', runInitialCheck);
      resizeObserver.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled]);
}
