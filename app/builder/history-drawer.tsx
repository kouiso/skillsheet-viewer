'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProjectBlockData } from '@/db/blocks';

import { formatHistoryTime, HISTORY_LIMIT, type HistoryEntry } from './history';

interface HistoryDrawerProps {
  entries: HistoryEntry[];
  onClose: () => void;
  onRestore: (snapshot: ProjectBlockData) => void;
}

/**
 * 変更履歴ドロワー（右から出る）。
 * 先頭が現在の状態なので「戻す」は 2 件目以降にだけ出す。
 */
export const HistoryDrawer = ({ entries, onClose, onRestore }: HistoryDrawerProps) => {
  // 「N分前」を出すための基準時刻。開いた瞬間に固定する（描画のたびにずれないように）。
  const [now, setNow] = useState(() => Date.now());

  // onClose は親でインライン生成されるため、依存に入れると毎レンダーで
  // イベント登録とタイマーが張り直される。最新の関数だけ ref で参照する。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    // 開いている間だけ 30 秒ごとに相対時刻を更新する
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    // `<dialog open>` を直接書くと非モーダルになり、top layer にも載らず背面が inert にならない。
    // その結果 Tab が背後の編集画面へ抜け、キーボード利用者はフォーカスを見失う。
    // showModal() で開くことでブラウザ標準のフォーカス閉じ込めを効かせる。
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // 開いた直後の操作先をドロワー内へ移す。ここを移さないと、Tab が背後のトップバーから
    // 始まってしまい、キーボードだけでは中身へ辿り着けない。
    closeButtonRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearInterval(timer);
      if (dialog?.open) dialog.close();
    };
  }, []);

  const restore = (entry: HistoryEntry) => {
    if (!window.confirm(`「${entry.label}」の時点に戻しますか？\nいまの編集内容は失われます。`)) return;
    onRestore(entry.snapshot);
    onClose();
  };

  return (
    <div className="hist-overlay">
      {/* open 属性は付けない。付けると非モーダルになる（上の useEffect で showModal する）。 */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 背景クリックはポインタ専用の補助操作で、
          キーボードからは Escape（onCancel）と見出し右の閉じるボタンで閉じられる。 */}
      <dialog
        ref={dialogRef}
        className="hist-drawer"
        aria-label="変更履歴"
        onClick={(e) => {
          // showModal() は dialog 以外を inert にするため、背景に別ボタンを重ねても押せない。
          // 背景（::backdrop）へのクリックは dialog 自身が target になるので、それで判定する。
          if (e.target === e.currentTarget) onCloseRef.current();
        }}
        onCancel={(e) => {
          // Escape はブラウザが dialog を閉じるが、親の開閉状態も合わせないと再度開けなくなる。
          e.preventDefault();
          onCloseRef.current();
        }}
      >
        <div className="hist-head">
          <div>
            <strong>変更履歴</strong>
            <div className="hist-sub">このブラウザに最新 {HISTORY_LIMIT} 件まで残ります（サーバへは送りません）</div>
          </div>
          <button type="button" ref={closeButtonRef} className="btn ghost sm" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="hist-empty">まだ履歴がありません。案件を編集すると、ここに変更内容が時系列で積まれます。</p>
        ) : (
          <div className="hist-list scroll">
            {entries.map((entry, i) => (
              <div key={entry.id ?? `at-${entry.at}`} className={`hist-item${i === 0 ? ' now' : ''}`}>
                <span className="t">
                  {formatHistoryTime(entry.at, now)}
                  {i === 0 && ' · いまの状態'}
                </span>
                <span className="l">{entry.label}</span>
                {i > 0 && (
                  <button type="button" className="btn sm hist-restore" onClick={() => restore(entry)}>
                    この時点に戻す
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </dialog>
    </div>
  );
};
