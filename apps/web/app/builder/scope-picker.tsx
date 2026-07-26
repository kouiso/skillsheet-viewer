'use client';

import { useState } from 'react';

import { SCOPE_OPTIONS, SCOPE_SEPARATOR } from './editor-constants';

interface ScopePickerProps {
  /** 保存形式のまま（" / " 連結の1本の文字列）受け取る。 */
  value: string;
  onChange: (value: string) => void;
}

/** 保存形式（" / " 連結）と配列の相互変換。区切り前後の空白と空要素は落とす。 */
const parseScope = (value: string): string[] =>
  value
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

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

  const commit = (next: string[]) => onChange(next.join(SCOPE_SEPARATOR));

  const toggle = (option: string) => {
    if (selectedSet.has(option)) {
      commit(selected.filter((s) => s !== option));
    } else {
      commit([...selected, option]);
    }
  };

  const addDraft = () => {
    const name = draft.trim();
    if (!name || selectedSet.has(name)) {
      setDraft('');
      return;
    }
    commit([...selected, name]);
    setDraft('');
  };

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
