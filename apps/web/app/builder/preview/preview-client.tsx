'use client';

import { useEffect, useState } from 'react';

import SkillSheetViewer from '@/component/skill-sheet-viewer';

// builder-client.tsx と共有するキー（別ウィンドウ連携用）。
const PREVIEW_CHANNEL_NAME = 'builder-preview';
const PREVIEW_STORAGE_KEY = 'builder-preview-payload';

type PreviewPayload = { title: string; content: string };

const isPreviewPayload = (value: unknown): value is PreviewPayload =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as PreviewPayload).title === 'string' &&
  typeof (value as PreviewPayload).content === 'string';

export default function PreviewClient() {
  const [payload, setPayload] = useState<PreviewPayload | null>(null);

  useEffect(() => {
    // マウント時: window.open 直前にエディタ側がシード保存した内容を読み、
    // 別窓を開いた瞬間から即座にプレビューが見える状態にする。
    try {
      const seeded = localStorage.getItem(PREVIEW_STORAGE_KEY);
      if (seeded) {
        const parsed = JSON.parse(seeded);
        if (isPreviewPayload(parsed)) setPayload(parsed);
      }
    } catch {
      // localStorage が読めない環境では BroadcastChannel の初回更新を待つ。
    }

    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(PREVIEW_CHANNEL_NAME);
    channel.onmessage = (event) => {
      if (isPreviewPayload(event.data)) setPayload(event.data);
    };
    return () => channel.close();
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <SkillSheetViewer skillSheet={{ title: payload?.title.trim() || 'プレビュー', content: payload?.content ?? '' }} compareMode />
    </div>
  );
}
