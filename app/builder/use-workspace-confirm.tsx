'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

export interface WorkspaceConfirmOptions {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** 確認側が破壊的（危険の色の枠）。「捨てる系は左・戻るが主」という板の並びもこの印で選ぶ */
  danger?: boolean;
  details?: ReactNode;
  /** 見出しの丸アイコンの種類。省略時は danger なら danger、でなければ normal */
  tone?: 'notice' | 'danger' | 'normal';
  /** 主ボタン（地色付き）にする側。danger の側は常に危険の色が優先される。既定は confirm */
  primary?: 'confirm' | 'cancel';
  /** 最初にフォーカスする側。既定は cancel（誤って進めない側） */
  initialFocus?: 'confirm' | 'cancel';
  /** 確認側を左に置く。板では「捨てる（危険）が左・編集に戻る（主）が右」の並びがある */
  confirmFirst?: boolean;
}

/* 板の「見出しのアイコンは 32px の丸（注意・危険・通常）」。色はテーマのトークンで
   明・暗の両方を兼ねる（色の差し替え自体は #671 の範囲） */
const TONES = {
  notice: { Icon: TriangleAlert, className: 'bg-warn-soft text-warn-strong' },
  danger: { Icon: OctagonAlert, className: 'bg-danger-soft text-danger' },
  normal: { Icon: Info, className: 'bg-accent-soft text-accent-text' },
} as const;

/* 板のボタン: 高さ 36px（390px では 44px）・横 12px・13px・太さ 600・角丸 4px */
const BUTTON_BASE =
  'h-9 rounded-[4px] border px-3 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:h-11 max-sm:w-full';
const BUTTON_STYLES = {
  primary: 'border-primary-dark bg-primary-dark text-primary-foreground',
  normal: 'border-border bg-background text-foreground',
  danger: 'border-destructive bg-background text-destructive',
} as const;

/** 同時要求は後発を取消扱いにし、先に表示した確認を置き換えない。 */
export function useWorkspaceConfirm({ fallbackFocus }: { fallbackFocus?: () => HTMLElement | null } = {}) {
  const [options, setOptions] = useState<WorkspaceConfirmOptions | null>(null);
  const pending = useRef<((answer: boolean) => void) | null>(null);
  const origin = useRef<HTMLElement | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const fallback = useRef(fallbackFocus);
  fallback.current = fallbackFocus;

  const restoreFocus = useCallback(() => {
    const fallbackTarget = fallback.current?.();
    const ephemeralOrigin = origin.current?.closest('[data-radix-popper-content-wrapper]');
    const target = origin.current?.isConnected && !ephemeralOrigin ? origin.current : fallbackTarget;
    target?.focus();
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const resolve = pending.current;
      pending.current = null;
      resolve?.(false);
      if (resolve) restoreFocus();
    };
  }, [restoreFocus]);

  const confirm = useCallback((next: WorkspaceConfirmOptions): Promise<boolean> => {
    if (!mounted.current || pending.current) return Promise.resolve(false);
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
      setOptions(next);
    });
  }, []);

  const finish = useCallback((answer: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setOptions(null);
    resolve?.(answer);
  }, []);

  const tone = options?.tone ?? (options?.danger ? 'danger' : 'normal');
  const { Icon, className: iconClassName } = TONES[tone];
  const primary = options?.primary ?? 'confirm';
  /* 390px では主・危険など目立つ側を上に積む（板「主ボタンが上」） */
  const emphasized = primary;
  const confirmStyle = options?.danger
    ? BUTTON_STYLES.danger
    : primary === 'confirm'
      ? BUTTON_STYLES.primary
      : BUTTON_STYLES.normal;
  const cancelStyle = primary === 'cancel' ? BUTTON_STYLES.primary : BUTTON_STYLES.normal;

  const cancelElement = (
    <button
      key="cancel"
      ref={cancel}
      type="button"
      onClick={() => finish(false)}
      className={`${BUTTON_BASE} ${cancelStyle} ${emphasized === 'cancel' ? 'max-sm:order-first' : ''}`}
    >
      {options?.cancelLabel ?? 'やめる'}
    </button>
  );
  const confirmElement = (
    <button
      key="confirm"
      ref={confirmButton}
      type="button"
      onClick={() => finish(true)}
      className={`${BUTTON_BASE} ${confirmStyle} ${emphasized === 'confirm' ? 'max-sm:order-first' : ''}`}
    >
      {options?.confirmLabel}
    </button>
  );

  const dialog = (
    <Dialog.Root
      open={options !== null}
      onOpenChange={(open) => {
        if (!open) finish(false);
      }}
    >
      <Dialog.Portal>
        {/* 板: オーバーレイは rgba(16,23,26,.45)（暗い配色は .66 の黒） */}
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-[rgba(16,23,26,.45)] dark:bg-[rgba(0,0,0,.66)]" />
        <Dialog.Content
          role="alertdialog"
          /* 板: 最大幅 480px・角丸 8px・内側 24px（390px では 20px）・中の間隔 10px。
             影は明るい配色 0 18px 44px -18px rgba(16,23,26,.38)（暗い配色は .66 の黒） */
          className="fixed left-1/2 top-1/2 z-[81] flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 flex-col gap-2.5 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-[0_18px_44px_-18px_rgba(16,23,26,.38)] max-sm:p-5 dark:shadow-[0_18px_44px_-18px_rgba(0,0,0,.66)]"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            ((options?.initialFocus ?? 'cancel') === 'confirm' ? confirmButton : cancel).current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus();
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconClassName}`}
              aria-hidden="true"
            >
              <Icon className="h-4 w-4" />
            </span>
            {/* 板の題名: 16px・太さ 700・行高 1.6 */}
            <Dialog.Title className="min-w-0 break-words text-base font-bold leading-[1.6]">
              {options?.title}
            </Dialog.Title>
          </div>
          {/* 板の本文: 13.5px・行高 1.8・左 44px（390px では 0）。44px はアイコン 32px + 間隔 12px */}
          <Dialog.Description className="break-words pl-11 text-[13.5px] leading-[1.8] text-muted-foreground max-sm:pl-0">
            {options?.description}
          </Dialog.Description>
          {options?.details && (
            <div className="min-h-0 overflow-y-auto break-words pl-11 text-sm max-sm:pl-0">{options.details}</div>
          )}
          {/* 390px では縦に並べて幅いっぱい。目立つ側が上になるよう order-first を付けている */}
          <div className="flex flex-wrap justify-end gap-2 max-sm:flex-col">
            {options?.confirmFirst ? [confirmElement, cancelElement] : [cancelElement, confirmElement]}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
  return { confirm, dialog };
}
