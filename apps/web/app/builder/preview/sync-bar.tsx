'use client';

import './sync-bar.css';

export type SyncState = 'live' | 'stale' | 'closed' | 'standalone';

interface SyncBarProps {
  state: SyncState;
  /** 最後に編集画面から内容を受け取った時刻（epoch ミリ秒）。未受信なら null。 */
  lastUpdatedAt: number | null;
  onReconnect: () => void;
}

const LABEL: Record<SyncState, string> = {
  live: '編集中の内容を同期表示',
  stale: '同期が途切れています',
  closed: '編集画面が閉じられました — 表示は最後の内容です',
  // #151 U-5: 「編集画面を開いたことがない（このURLへ直接アクセスした）」を
  // 「接続後に閉じられた」と同一の closed 扱いにしていたため、本文が空なのに
  // 「最後の内容です」と出て、データを失ったと誤解させていた。
  standalone: '表示できるプレビューがありません。ビルダー画面のプレビューボタンから開いてください。',
};

const formatStamp = (at: number): string => {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `最終更新 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/**
 * 別窓プレビューの最上部に出る同期状態の帯。
 *
 * 色だけで区別しない（文言でも状態が分かる）。本文は状態が変わっても消さず、
 * 最後に受け取った内容を残したまま帯だけ変える — 別窓を資料として見ている最中に
 * 内容が消えるほうが困るため。
 */
export const SyncBar = ({ state, lastUpdatedAt, onReconnect }: SyncBarProps) => (
  <div className={`syncbar ${state} no-print`} role="status" aria-live="polite">
    <span aria-hidden className="dot" />
    <span className="lbl">{LABEL[state]}</span>
    <span className="grow" />
    {/* lastUpdatedAt は epoch ミリ秒。`&&` だと 0 のとき裸の 0 が描画されるので明示的に比較する。 */}
    {state === 'live' && lastUpdatedAt !== null && <span className="stamp">{formatStamp(lastUpdatedAt)}</span>}
    {state === 'stale' && (
      <button type="button" className="reconnect" onClick={onReconnect}>
        ↻ 再接続
      </button>
    )}
  </div>
);
