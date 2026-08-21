'use client';

import { useState } from 'react';

import { SCOPE_OPTIONS, SCOPE_SEPARATOR } from './editor-constants';

interface ScopePickerProps {
  /** 保存形式のまま（" / " 連結の1本の文字列）受け取る。 */
  value: string;
  onChange: (value: string) => void;
}

/**
 * 保存形式（" / " 連結）と配列の相互変換。
 *
 * 区切りは「前後に空白のあるスラッシュ」に限定する。素の `/` で割ると
 * 「CI/CD」「AI/ML」のように語の中にスラッシュを含む自由入力が分裂してしまう。
 * 旧データには空白無しの `A/B` 形式も混じりうるので、要素が1つも取れない場合だけ
 * 素のスラッシュで割り直す（既存データを読めなくしない）。
 */
const parseScope = (value: string): string[] => {
  const strict = value
    .split(/\s+\/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (strict.length > 1 || !value.includes('/')) return strict;
  return value
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
};

/**
 * スコープ / 担当領域のピル型複数選択。
 *
 * マスタ（SCOPE_OPTIONS）に無い値も「その他」欄から足せる。既存データの自由記述
 * （例「iOS / Android / Web / バックエンド」）はそのまま選択済みピルとして復元され、
 * マスタ外の値も消さずに残す。
 */
export const ScopePicker = ({ value, onChange }: ScopePickerProps) => {
  const [draft, setDraft] = useState('');
  const selected = parseScope(value);
  const selectedSet = new Set(selected);
  // マスタ外の既存値（自由入力で足したもの）もピルとして出す。順序はマスタ → 追加分。
  const extras = selected.filter((s) => !(SCOPE_OPTIONS as readonly string[]).includes(s));

  /**
   * 「その他」入力とピルのクリックが同じ操作で連続発火しても、片方の更新が消えないようにする。
   * どちらも同じ `value` を元に次を組み立てるため、素直に書くと後勝ちで先の更新が失われる。
   * 未確定の入力を先に畳んでから目的の操作を適用し、1回の onChange にまとめる。
   */
  const commitWithDraft = (mutate: (current: string[]) => string[]) => {
    const name = draft.trim();
    const base = name && !selectedSet.has(name) ? [...selected, name] : selected;
    setDraft('');
    const next = mutate(base).join(SCOPE_SEPARATOR);
    // 空欄のままフォーカスが外れただけのときに、中身の変わらない更新を投げない
    // （変更履歴に「スコープを編集」が無駄に積まれる）。
    if (next !== value) onChange(next);
  };

  const toggle = (option: string) =>
    commitWithDraft((base) => (base.includes(option) ? base.filter((s) => s !== option) : [...base, option]));

  const addDraft = () => commitWithDraft((base) => base);

  return (
    <div className="scope-pick">
      {[...SCOPE_OPTIONS, ...extras].map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => toggle(option)}
          aria-pressed={selectedSet.has(option)}
          className={`scope-opt${selectedSet.has(option) ? ' on' : ''}`}
        >
          {option}
        </button>
      ))}
      <span className="scope-add">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={addDraft}
          onKeyDown={(e) => {
            // IME 変換確定の Enter を「追加」と取り違えない
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
            e.preventDefault();
            addDraft();
          }}
          placeholder="＋ その他"
          aria-label="スコープを自由入力で追加"
        />
      </span>
    </div>
  );
};
