'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import type { ProjectBlockData } from '@/db/block';

import { formatHistoryTime, HISTORY_LIMIT, type HistoryEntry } from './history';
import { useWorkspaceConfirm } from './use-workspace-confirm';

interface HistoryDrawerProps {
  entries: HistoryEntry[];
  legacyEntries?: HistoryEntry[];
  onClose: () => void;
  onRestore: (snapshot: ProjectBlockData) => void;
}

/**
 * 変更履歴ドロワー（右から出る）。
 * 先頭が現在の状態なので「戻す」は 2 件目以降にだけ出す。
 */
export const HistoryDrawer = ({ entries, legacyEntries = [], onClose, onRestore }: HistoryDrawerProps) => {
  // 「N分前」を出すための基準時刻。開いた瞬間に固定する（描画のたびにずれないように）。
  const [now, setNow] = useState(() => Date.now());

  // onClose は親でインライン生成されるため、依存に入れると毎レンダーで
  // イベント登録とタイマーが張り直される。最新の関数だけ ref で参照する。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const originRef = useRef<HTMLElement | null>(null);
  const { confirm, dialog } = useWorkspaceConfirm({ fallbackFocus: () => closeButtonRef.current });
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const restore = async (entry: HistoryEntry) => {
    if (
      !(await confirm({
        title: `「${entry.label}」の時点に戻しますか？`,
        description:
          'この案件ブロックの編集内容を、ブラウザに残っている履歴へ置き換えます。いまの未保存の編集内容は失われます。',
        confirmLabel: 'この時点に戻す',
        danger: true,
      }))
    )
      return;
    onRestore(entry.snapshot);
    onClose();
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onCloseRef.current();
      }}
    >
      {dialog}
      <Dialog.Portal>
        <Dialog.Overlay className="hist-overlay" data-testid="history-backdrop" />
        <Dialog.Content
          className="hist-drawer"
          style={{ position: 'fixed', zIndex: 56 }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const origin = originRef.current;
            const fallback = document.querySelector<HTMLElement>('[data-workspace-focus]');
            const stableOrigin = origin?.isConnected && !origin.closest('[data-radix-popper-content-wrapper]');
            (stableOrigin ? origin : fallback)?.focus();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            originRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            closeButtonRef.current?.focus();
          }}
        >
          <div className="hist-head">
            <div>
              <Dialog.Title className="font-semibold">変更履歴</Dialog.Title>
              <Dialog.Description className="hist-sub">
                このブラウザに最新 {HISTORY_LIMIT} 件まで残ります（サーバへは送りません）
              </Dialog.Description>
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
          {legacyEntries.length > 0 && (
            <details className="border-t border-border p-4">
              <summary className="cursor-pointer py-2 font-semibold">
                以前の端末履歴を確認（{legacyEntries.length}件）
              </summary>
              <p className="my-3 text-sm text-muted-foreground">
                この履歴には対象の案件ブロックが記録されていません。別の案件への誤反映を防ぐため閲覧のみ利用できます。
              </p>
              {legacyEntries.map((entry, index) => (
                <details key={entry.id ?? `legacy-${index}`} className="my-2 rounded border border-border p-3">
                  <summary className="cursor-pointer">
                    {entry.label} · {formatHistoryTime(entry.at, now)}
                  </summary>
                  <pre className="mt-3 whitespace-pre-wrap break-words text-xs">
                    {JSON.stringify(entry.snapshot, null, 2)}
                  </pre>
                </details>
              ))}
            </details>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
