'use client';

import { useCallback, useEffect, useRef } from 'react';

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

  const resizeToContent = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const needed = el.scrollHeight + 2;
    el.style.height = `${Math.min(needed, MAX_HEIGHT)}px`;
    el.style.overflowY = needed > MAX_HEIGHT ? 'auto' : 'hidden';
  }, []);

  // 値が外から変わる場合（履歴からの復元・案件切替）も高さを合わせ直す必要があるため、
  // onChange ハンドラではなく value を依存にした effect で調整する。
  // value は本文に現れないが、textarea の scrollHeight は value の描画結果に依存するので、
  // 依存から外すと値が変わっても伸び縮みしなくなる。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 上の理由で value を意図的に依存へ残す
  useEffect(() => {
    resizeToContent();
  }, [value, resizeToContent]);

  // 幅が変わると同じ文章でも行数が変わる（プレビュー列の開閉・ウィンドウ幅の変更・
  // 縦横の切り替え）。value は変わらないので上の effect では拾えず、
  // 幅を狭めたときだけ中身が枠から溢れたままになる。
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // 高さは resizeToContent() 自身が書き換えるため、高さの変化で再実行すると観測が止まらなくなる。
    // 幅が実際に変わったときだけ合わせ直す。
    let lastWidth = el.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = el.clientWidth;
      if (width === lastWidth) return;
      lastWidth = width;
      resizeToContent();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [resizeToContent]);

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
