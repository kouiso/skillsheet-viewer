'use client';

import { useRef, useState } from 'react';

interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** サジェスト候補（未追加×部分一致で最大 SUGGESTION_LIMIT 件表示）。 */
  suggestions?: string[];
  /** アクセシビリティ用のフィールド名（例: 「使用言語」）。 */
  label?: string;
}

/**
 * サジェストの表示上限。design（editor/form.jsx）と同じ 40 件。
 * ポップは max-height 262px でスクロールするため、件数を絞るより出し切って検索させる方針。
 */
const SUGGESTION_LIMIT = 40;

/**
 * チップ形式のタグ入力（技術スタック等）。
 *
 * - Enter / カンマで確定（カンマ・読点区切りの複数一括追加に対応）
 * - IME 変換確定の Enter ではタグ追加しない（日本語入力対応）
 * - ↑↓ でサジェスト選択、Backspace（空入力時）で末尾タグ削除
 * - claude.ai/design プロトタイプ（editor/form.jsx TagInput）の移植
 */
export const TagInput = ({ value, onChange, placeholder, suggestions, label }: TagInputProps) => {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = draft.trim().toLowerCase();
  // 候補：未追加 × 部分一致（入力空なら先頭から）
  const matches = (suggestions ?? [])
    .filter((s) => !value.includes(s) && (!q || s.toLowerCase().includes(q)))
    .slice(0, SUGGESTION_LIMIT);

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
    // biome-ignore lint/a11y/noStaticElementInteractions: 同上。実際の操作対象は内部の input（適切な aria-label 済み）
    <div className="tagbox cursor-text" onClick={() => inputRef.current?.focus()}>
      {value.map((tag, i) => (
        // タグは add() で重複追加を防いでいるため値そのものが一意なキーになる。
        <span key={tag} className="tag">
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              remove(i);
            }}
            aria-label={`${tag} を削除`}
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
        onChange={(e) => {
          setDraft(e.target.value);
          setOpen(true);
          // design は先頭候補を自動ハイライトするが、ここでは採らない。ハイライトしたままだと
          // Enter が matches[hi] を確定してしまい、候補の部分文字列（実データにある
          // "Java" と "JavaScript" / "React" と "React Native"）をタイプした本人の入力どおりに
          // Enter で追加できなくなる。候補の確定は ↑↓/マウスでの明示的な選択のみとし、
          // Enter は既定で入力テキストを追加する。
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
          } else if (e.key === 'Enter' || e.key === ',' || e.key === '、') {
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
        <div className="sug-pop scroll" onMouseDown={(e) => e.preventDefault()}>
          <div className="sug-head">
            候補 {matches.length}件 {q ? `— 「${draft.trim()}」に一致` : '— 入力で検索 / ↑↓で選択'}
          </div>
          {matches.map((s, i) => {
            const idx = q ? s.toLowerCase().indexOf(q) : -1;
            return (
              <button
                key={s}
                type="button"
                className={`sug-item${i === hi ? ' hi' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(s);
                }}
                onMouseEnter={() => setHi(i)}
              >
                {idx >= 0 ? (
                  <>
                    {s.slice(0, idx)}
                    <b>{s.slice(idx, idx + q.length)}</b>
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
