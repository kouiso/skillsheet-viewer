'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import SkillSheetViewer from '@/component/skill-sheet-viewer';

import { SyncBar, type SyncState } from './sync-bar';

// builder-client.tsx と共有するキー（別ウィンドウ連携用）。
const PREVIEW_CHANNEL_NAME = 'builder-preview';
const PREVIEW_STORAGE_KEY = 'builder-preview-payload';

/**
 * この時間だけ何も届かなければ「同期が途切れた」とみなす。
 * 編集側は内容が変わらなくても 4 秒ごとに生存確認を送る（builder-client の
 * PREVIEW_HEARTBEAT_MS）ので、手が止まっているだけの状態では途切れ扱いにならない。
 */
const STALE_AFTER_MS = 12_000;

type PreviewPayload = { title: string; content: string };

const isPreviewPayload = (value: unknown): value is PreviewPayload =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as PreviewPayload).title === 'string' &&
  typeof (value as PreviewPayload).content === 'string';

export default function PreviewClient() {
  const [payload, setPayload] = useState<PreviewPayload | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('live');
  const channelRef = useRef<BroadcastChannel | null>(null);

  /** BroadcastChannel を張り直す。初回マウントと「再接続」ボタンの両方から呼ぶ。 */
  const connect = useCallback(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    channelRef.current?.close();
    const channel = new BroadcastChannel(PREVIEW_CHANNEL_NAME);
    channel.onmessage = (event) => {
      if (!isPreviewPayload(event.data)) return;
      setPayload(event.data);
      setLastUpdatedAt(Date.now());
      setSyncState('live');
    };
    channelRef.current = channel;
  }, []);

  useEffect(() => {
    // マウント時: window.open 直前にエディタ側がシード保存した内容を読み、
    // 別窓を開いた瞬間から即座にプレビューが見える状態にする。
    try {
      const seeded = localStorage.getItem(PREVIEW_STORAGE_KEY);
      if (seeded) {
        const parsed = JSON.parse(seeded);
        if (isPreviewPayload(parsed)) {
          setPayload(parsed);
          setLastUpdatedAt(Date.now());
        }
      }
    } catch {
      // localStorage が読めない環境では BroadcastChannel の初回更新を待つ。
    }
    connect();
    return () => channelRef.current?.close();
  }, [connect]);

  // 状態の判定は「編集画面が生きているか」→「最近更新が来たか」の順。
  // 編集画面が閉じられた場合は再接続しても内容は来ないので、再接続ボタンを出さない。
  useEffect(() => {
    const tick = () => {
      const openerGone = typeof window !== 'undefined' && (!window.opener || window.opener.closed);
      if (openerGone) {
        setSyncState('closed');
        return;
      }
      setSyncState(lastUpdatedAt && Date.now() - lastUpdatedAt > STALE_AFTER_MS ? 'stale' : 'live');
    };
    tick();
    const timer = window.setInterval(tick, 2_000);
    return () => window.clearInterval(timer);
  }, [lastUpdatedAt]);

  return (
    <>
      <SyncBar state={syncState} lastUpdatedAt={lastUpdatedAt} onReconnect={connect} />
      <div className={`mx-auto max-w-4xl px-4 py-6 sm:px-6 ${syncState === 'live' ? '' : 'stale-body'}`}>
        <SkillSheetViewer
          skillSheet={{ title: payload?.title?.trim() || 'プレビュー', content: payload?.content ?? '' }}
          compareMode
        />
      </div>
    </>
  );
}
