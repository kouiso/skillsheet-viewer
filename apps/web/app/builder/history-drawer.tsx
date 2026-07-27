'use client';

import type { ProjectBlockData } from '@skillsheet/db/blocks';
import { useEffect, useState } from 'react';

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // 開いている間だけ 30 秒ごとに相対時刻を更新する
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearInterval(timer);
    };
  }, [onClose]);

  const restore = (entry: HistoryEntry) => {
    if (!window.confirm(`「${entry.label}」の時点に戻しますか？\nいまの編集内容は失われます。`)) return;
    onRestore(entry.snapshot);
    onClose();
  };

  return (
    <div className="hist-overlay">
      {/* 背景を閉じるための実ボタン。div に onClick を付けるとキーボードから閉じられないため、
          全面を覆うボタンにしてある（見た目は透明）。Escape でも閉じる。 */}
      <button type="button" className="hist-overlay-close" aria-label="変更履歴を閉じる" onClick={onClose} />
      <dialog className="hist-drawer" aria-label="変更履歴" open>
        <div className="hist-head">
          <div>
            <strong>変更履歴</strong>
            <div className="hist-sub">このブラウザに最新 {HISTORY_LIMIT} 件まで残ります（サーバへは送りません）</div>
          </div>
          <button type="button" className="btn ghost sm" onClick={onClose} aria-label="閉じる">
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
