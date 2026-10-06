'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** 入力確認の描画を遅延させずに、非同期処理の二重実行を防ぐ。 */
export function usePendingOperation(): readonly [boolean, (action: () => Promise<void>) => Promise<void>] {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const run = useCallback(async (action: () => Promise<void>) => {
    if (pending.current || !mounted.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);
  return [busy, run] as const;
}
