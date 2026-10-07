'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import SkillSheetViewer from '@/component/skill-sheet-viewer';
import { SyncBar, type SyncState } from './sync-bar';

// 既存のキーと4秒heartbeatを維持し、送信元と単調な連番で別窓の混入を防ぐ。
const PREVIEW_CHANNEL_NAME = 'builder-preview';
const PREVIEW_STORAGE_KEY = 'builder-preview-payload';
const STALE_AFTER_MS = 12_000;
type PreviewPayload = { title: string; content: string; sessionId: string; sequence: number };
const isPreviewPayload = (value: unknown): value is PreviewPayload => {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Partial<PreviewPayload>;
  return (
    typeof payload.title === 'string' &&
    typeof payload.content === 'string' &&
    typeof payload.sessionId === 'string' &&
    Number.isSafeInteger(payload.sequence) &&
    Number(payload.sequence) >= 0
  );
};

const openerAlive = () => {
  try {
    return Boolean(window.opener && !window.opener.closed);
  } catch {
    return false;
  }
};

export default function PreviewClient() {
  const [payload, setPayload] = useState<PreviewPayload | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('waiting');
  const channelRef = useRef<BroadcastChannel | null>(null);
  const session = useRef<string | null>(null);
  const sequence = useRef(-1);
  const receivedAt = useRef<number | null>(null);
  const startedAt = useRef(0);

  const accept = useCallback((value: unknown) => {
    if (
      !session.current ||
      !openerAlive() ||
      !isPreviewPayload(value) ||
      value.sessionId !== session.current ||
      value.sequence <= sequence.current
    )
      return;
    sequence.current = value.sequence;
    receivedAt.current = Date.now();
    setPayload(value);
    setLastUpdatedAt(receivedAt.current);
    setSyncState('live');
  }, []);

  /** 再接続後も連番を保持し、閉じたchannelの遅延イベントを受け入れない。 */
  const connect = useCallback(() => {
    channelRef.current?.close();
    channelRef.current = null;
    if (!session.current || !openerAlive()) return;
    try {
      if (typeof BroadcastChannel === 'undefined') {
        setSyncState('stale');
        return;
      }
      const channel = new BroadcastChannel(PREVIEW_CHANNEL_NAME);
      channelRef.current = channel;
      channel.onmessage = (event) => {
        if (channelRef.current === channel) accept(event.data);
      };
    } catch {
      setSyncState('stale');
    }
  }, [accept]);

  useEffect(() => {
    const candidate = new URLSearchParams(window.location.search).get('session');
    session.current = window.opener && candidate ? candidate : null;
    startedAt.current = Date.now();
    if (!session.current) {
      setSyncState('standalone');
      return;
    }
    try {
      const seed = localStorage.getItem(PREVIEW_STORAGE_KEY);
      if (seed) accept(JSON.parse(seed));
    } catch {
      // ストレージ拒否や壊れたseedでも、次のheartbeatを待つ。
    }
    connect();
    const tick = () => {
      if (!openerAlive()) {
        setSyncState('closed');
        return;
      }
      if (Date.now() - (receivedAt.current ?? startedAt.current) > STALE_AFTER_MS) setSyncState('stale');
    };
    tick();
    const timer = window.setInterval(tick, 2000);
    return () => {
      window.clearInterval(timer);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [accept, connect]);

  return (
    <>
      <SyncBar state={syncState} lastUpdatedAt={lastUpdatedAt} onReconnect={connect} />
      <main className="preview-document mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <p className="mb-5 text-sm text-muted-foreground">
          編集中の内容を表示しています。保存状況は編集画面で確認してください。
        </p>
        {payload ? (
          <SkillSheetViewer
            skillSheet={{ title: payload.title.trim() || 'プレビュー', content: payload.content }}
            compareMode
          />
        ) : (
          <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
            <h1 className="text-lg font-semibold">プレビュー</h1>
            <p className="mt-2 text-sm text-muted-foreground">ここに表示する内容がありません。</p>
          </div>
        )}
      </main>
    </>
  );
}
