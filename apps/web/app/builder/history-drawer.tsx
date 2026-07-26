'use client';

import type { ProjectBlockData } from '@skillsheet/db/blocks';
import { useEffect, useState } from 'react';

import { formatHistoryTime, type HistoryEntry, HISTORY_LIMIT } from './history';

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
    // biome-ignore lint/a11y/noStaticElementInteractions: 背景クリックで閉じるだけ。Escape も別途受けている。
    <div className="hist-overlay" onClick={onClose}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 中身のクリックが背景へ伝わって閉じるのを止めるだけ。 */}
      <div
        className="hist-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="変更履歴"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hist-head">
          <div>
            <strong>変更履歴</strong>
            <div className="hist-sub">
              このブラウザに最新 {HISTORY_LIMIT} 件まで残ります（サーバへは送りません）
            </div>
          </div>
          <button type="button" className="btn ghost sm" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="hist-empty">
            まだ履歴がありません。案件を編集すると、ここに変更内容が時系列で積まれます。
          </p>
        ) : (
          <div className="hist-list scroll">
            {entries.map((entry, i) => (
              <div key={`${entry.at}-${i}`} className={`hist-item${i === 0 ? ' now' : ''}`}>
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
      </div>
    </div>
  );
};
