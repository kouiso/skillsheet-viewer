'use client';

import { useRef, useState } from 'react';

interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** サジェスト候補（未追加×部分一致で最大8件表示）。 */
  suggestions?: string[];
  /** アクセシビリティ用のフィールド名（例: 「使用言語」）。 */
  label?: string;
}

/**
 * チップ形式のタグ入力（技術スタック等）。
 *
 * - Enter / カンマで確定（カンマ・読点区切りの複数一括追加に対応）
 * - IME 変換確定の Enter ではタグ追加しない（日本語入力対応）
 * - ↑↓ でサジェスト選択、Backspace（空入力時）で末尾タグ削除
 * - claude.ai/design プロトタイプ（editor-form.jsx TagInput）の移植
 */
export const TagInput = ({ value, onChange, placeholder, suggestions, label }: TagInputProps) => {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = draft.trim().toLowerCase();
  // 候補：未追加 × 部分一致（入力空なら先頭から）
  const matches = (suggestions ?? []).filter((s) => !value.includes(s) && (!q || s.toLowerCase().includes(q))).slice(0, 8);

  const add = (raw: string) => {
    const parts = raw
      .split(/[,、]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...value];
    for (const p of parts) {
      if (!next.includes(p)) next.push(p);
    }
    onChange(next);
    setDraft('');
    setHi(-1);
  };

  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: クリックは内部 input へのフォーカス移譲のみ（キーボード操作は input 自身が受ける）
    <div
      className="relative flex min-h-9 w-full cursor-text flex-wrap items-center gap-1.5 rounded border border-input bg-background px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring"
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag, i) => (
        <span key={`${tag}-${i}`} className="chip">
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              remove(i);
            }}
            aria-label={`${tag} を削除`}
            className="ml-1 text-muted-foreground hover:text-destructive"
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={draft}
        aria-label={label ?? 'タグを追加'}
        placeholder={value.length > 0 ? '' : (placeholder ?? '入力して Enter')}
        className="min-w-24 flex-1 bg-transparent text-sm focus:outline-none"
        onChange={(e) => {
          setDraft(e.target.value);
          setOpen(true);
          // 入力中に先頭候補を自動ハイライトしない。ハイライトしたままだと Enter が
          // matches[hi] を確定してしまい、候補の部分文字列（例: "Java" と "JavaScript"）を
          // タイプした本人の入力どおりに Enter で追加できなくなる。候補の確定は
          // ↑↓/マウスでの明示的な選択のみとし、Enter は既定で入力テキストを追加する。
          setHi(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          // IME変換確定のEnterでタグ追加しない（日本語入力対応）
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === 'ArrowDown' && !open) {
            setOpen(true);
            setHi(0);
            return;
          }
          if (open && matches.length > 0 && e.key === 'ArrowDown') {
            e.preventDefault();
            setHi((hi + 1) % matches.length);
          } else if (open && matches.length > 0 && e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((hi - 1 + matches.length) % matches.length);
          } else if (e.key === 'Escape') {
            setOpen(false);
            setHi(-1);
          } else if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            if (open && hi >= 0 && matches[hi]) add(matches[hi]);
            else add(draft);
          } else if (e.key === 'Backspace' && !draft && value.length > 0) {
            remove(value.length - 1);
          }
        }}
        onBlur={() => {
          add(draft);
          setOpen(false);
        }}
      />
      {open && matches.length > 0 && (
        // biome-ignore lint/a11y/noStaticElementInteractions: mouseDown 抑止は blur によるポップアップ消失防止のみ
        <div
          className="absolute left-0 top-full z-30 mt-1 w-full min-w-48 rounded border border-border bg-card py-1 shadow-md"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-faint">
            候補 {q ? `— 「${draft.trim()}」に一致` : '— ↑↓で選択 / Enterで追加'}
          </div>
          {matches.map((s, i) => {
            const idx = q ? s.toLowerCase().indexOf(q) : -1;
            return (
              <button
                key={s}
                type="button"
                className={`block w-full px-2 py-1 text-left text-sm ${i === hi ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(s);
                }}
                onMouseEnter={() => setHi(i)}
              >
                {idx >= 0 ? (
                  <>
                    {s.slice(0, idx)}
                    <b className="text-foreground">{s.slice(idx, idx + q.length)}</b>
                    {s.slice(idx + q.length)}
                  </>
                ) : (
                  s
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
