'use client';

import { useId, useRef } from 'react';

interface MonthDatePickerProps {
  /** `YYYY-MM`。未入力は空文字。 */
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
}

/** `YYYY-MM` を表示用の `YYYY.MM` にする。空・不正はそのまま返して呼び出し側で placeholder 判定する。 */
const formatMonth = (value: string): string => (/^\d{4}-\d{2}$/.test(value) ? value.replace('-', '.') : '');

/** 実行時の「今月」を `YYYY-MM` で返す。 */
const currentMonth = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * 期間の月ピッカー。
 *
 * design（editor/form.jsx の DatePick）は「ネイティブ入力を透明で重ね、見た目は自前の枠」という作りで、
 * ブラウザ既定の日付入力の見た目を出さずに OS のカレンダーを使う。ここもそれに合わせる。
 * design は日付精度（type=date）だが、このアプリのデータは月精度（periodStart: `YYYY-MM`）なので
 * type="month" にしている。見た目・操作は design のまま、保存される粒度だけ既存モデルに合わせた。
 */
export const MonthDatePicker = ({
  value,
  onChange,
  label,
  placeholder = '未選択',
  disabled,
  error,
}: MonthDatePickerProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const shown = formatMonth(value);
  const isNow = Boolean(value) && value === currentMonth();

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    // showPicker は Safari 等で未実装。その場合は focus + click でネイティブUIを促す。
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        // ユーザー操作起因でない等で拒否された場合はフォールバックへ落ちる
      }
    }
    el.focus();
    el.click();
  };

  return (
    <span className="datepick-wrap">
      <button
        type="button"
        className={`datepick${isNow ? ' now' : ''}${disabled ? ' off' : ''}${error ? ' err' : ''}`}
        disabled={disabled}
        aria-label={label}
        aria-describedby={id}
        onClick={openPicker}
      >
        {shown ? (
          <span className="dval" id={id}>
            {shown}
          </span>
        ) : (
          <span className="ph" id={id}>
            {placeholder}
          </span>
        )}
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden role="img">
          <title>カレンダー</title>
          <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" stroke="currentColor" />
          <path d="M1.5 5.5h11M4.5 1v2M9.5 1v2" stroke="currentColor" strokeLinecap="round" />
        </svg>
      </button>
      {/* ネイティブ入力はボタンの中に置けない（HTML の入れ子として不正）ので兄弟にし、
          ラッパー基準で全面へ重ねる。見た目には出さず、OS のカレンダーを呼ぶためだけに使う。 */}
      {/* aria-hidden は付けない。showPicker 未対応のブラウザではこの入力へフォーカスを移すため、
          支援技術から見えない要素にフォーカスが飛ぶ状態を作らないようにする。
          タブ順からは外し、名前はボタンと同じものを与える。 */}
      <input
        ref={inputRef}
        type="month"
        value={value}
        disabled={disabled}
        tabIndex={-1}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  );
};
