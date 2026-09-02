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
    // スクロール不要なほど短いページなら、マウント直後の1回分の判定で 100% がそのまま送れる。
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

    checkDepth();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled]);
}
