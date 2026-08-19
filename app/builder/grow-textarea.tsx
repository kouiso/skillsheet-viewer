'use client';

import { useEffect, useRef } from 'react';

interface GrowTextareaProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  /** 同期ジャンプ用のキー（プレビュー側の同じキーへ対応づける）。 */
  syncKey?: string;
  onFocus?: () => void;
}

/** これ以上は伸ばさず内部スクロールへ切り替える高さ（design の GrowTa と同値）。 */
const MAX_HEIGHT = 520;

/**
 * 入力量に合わせて高さが伸びるテキストエリア。
 * 長文の担当業務・コメントで「小さい枠の中をスクロールしながら書く」状態を避けるためのもの。
 */
export const GrowTextarea = ({ value, onChange, label, placeholder, syncKey, onFocus }: GrowTextareaProps) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  // 値が外から変わる場合（履歴からの復元・案件切替）も高さを合わせ直す必要があるため、
  // onChange ハンドラではなく value を依存にした effect で調整する。
  // value は本文に現れないが、textarea の scrollHeight は value の描画結果に依存するので、
  // 依存から外すと値が変わっても伸び縮みしなくなる。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 上の理由で value を意図的に依存へ残す
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const needed = el.scrollHeight + 2;
    el.style.height = `${Math.min(needed, MAX_HEIGHT)}px`;
    el.style.overflowY = needed > MAX_HEIGHT ? 'auto' : 'hidden';
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="ta grow"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      placeholder={placeholder}
      aria-label={label}
      data-sync={syncKey}
    />
  );
};
