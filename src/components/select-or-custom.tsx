'use client';

import { useState } from 'react';

interface SelectOrCustomProps {
  value: string;
  options: string[];
  onChange: (next: string) => void;
  placeholder?: string;
  /**
   * 読み上げ用の名前。同じ行の他の入力欄には aria-label が付いているのに
   * この欄だけ無名で、スクリーンリーダーが「コンボボックス」としか読めなかった。
   * 呼び出し側が必ず渡せるよう必須にしている。
   */
  label: string;
}

export function SelectOrCustom({ value, options, onChange, placeholder, label }: SelectOrCustomProps) {
  const isKnownValue = value !== '' && options.includes(value);
  // 「その他」選択直後はonChange('')でvalueが空になるため、value由来の判定だけでは
  // 自由入力欄が即座に消えてしまう。選択操作そのものを別状態として保持する。
  const [isCustomMode, setIsCustomMode] = useState(!isKnownValue && value !== '');
  const showCustomInput = !isKnownValue && (isCustomMode || value !== '');
  const selectValue = showCustomInput ? '__custom__' : value;

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (v === '__custom__') {
      setIsCustomMode(true);
      onChange('');
    } else {
      setIsCustomMode(false);
      onChange(v);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        value={selectValue}
        onChange={handleSelectChange}
        aria-label={label}
        className="min-h-11 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">{placeholder ?? '選択してください'}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        <option value="__custom__">その他</option>
      </select>
      {showCustomInput && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label}（自由入力）`}
          placeholder="自由入力"
          className="min-h-11 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      )}
    </div>
  );
}
