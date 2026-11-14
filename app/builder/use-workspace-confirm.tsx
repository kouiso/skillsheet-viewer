'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

export interface WorkspaceConfirmOptions {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  details?: ReactNode;
  /** 見出しの丸アイコン。既定は danger なら 'danger'、それ以外は 'info'（デザインボードの .dlg-ic）。 */
  icon?: WorkspaceConfirmIcon;
  /** ボタンの左右。既定の 'cancel-first' は取消が左。'danger-first' は確認（危険）が左でボードの「変更を捨てて移動」。 */
  order?: 'cancel-first' | 'danger-first';
  /** 取消側の見た目。'primary' はボードの「編集に戻る」「やめる（空のまま保存）」、'default' は削除系の「やめる」。 */
  cancelVariant?: 'default' | 'primary';
}

export type WorkspaceConfirmIcon = 'info' | 'warn' | 'danger';

const ICON_STYLE: Record<WorkspaceConfirmIcon, string> = {
  info: 'bg-accent-soft text-accent-text',
  warn: 'bg-warn-soft text-warn-strong',
  danger: 'bg-danger-soft text-danger',
};

function ConfirmIcon({ kind }: { kind: WorkspaceConfirmIcon }) {
  return (
    <span
      data-confirm-icon={kind}
      className={`grid size-8 shrink-0 place-items-center rounded-full ${ICON_STYLE[kind]}`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {kind === 'warn' && (
          <>
            <path d="M8 1.8l6.6 11.7H1.4z" />
            <path d="M8 6.2v3.6" />
            <path d="M8 11.6v.2" />
          </>
        )}
        {kind === 'danger' && (
          <>
            <path d="M2.5 4h11" />
            <path d="M6 4V2.5h4V4" />
            <path d="M4 4l.7 9.5h6.6L12 4" />
          </>
        )}
        {kind === 'info' && (
          <>
            <circle cx="8" cy="8" r="6" />
            <path d="M8 7.2v3.6" />
            <path d="M8 5v.2" />
          </>
        )}
      </svg>
    </span>
  );
}

const BUTTON_BASE =
  'h-11 w-full rounded-md border px-3 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-9 sm:w-auto';
const PRIMARY_BUTTON = 'border-primary-dark bg-primary-dark text-primary-foreground';
const DEFAULT_BUTTON = 'border-border bg-background text-foreground';
const DANGER_BUTTON = 'border-destructive bg-background text-destructive';

/** 同時要求は後発を取消扱いにし、先に表示した確認を置き換えない。 */
export function useWorkspaceConfirm({ fallbackFocus }: { fallbackFocus?: () => HTMLElement | null } = {}) {
  const [options, setOptions] = useState<WorkspaceConfirmOptions | null>(null);
  const pending = useRef<((answer: boolean) => void) | null>(null);
  const origin = useRef<HTMLElement | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
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

  const cancelButton = (
    <button
      key="cancel"
      ref={cancel}
      type="button"
      onClick={() => finish(false)}
      className={`${BUTTON_BASE} ${options?.cancelVariant === 'primary' ? PRIMARY_BUTTON : DEFAULT_BUTTON}`}
    >
      {options?.cancelLabel ?? 'やめる'}
    </button>
  );
  const confirmButton = (
    <button
      key="confirm"
      type="button"
      onClick={() => finish(true)}
      className={`${BUTTON_BASE} ${options?.danger ? DANGER_BUTTON : PRIMARY_BUTTON}`}
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
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/50" />
        <Dialog.Content
          role="alertdialog"
          className="fixed left-1/2 top-1/2 z-[81] flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 flex-col gap-2.5 rounded-xl border border-border bg-card p-5 sm:p-6 text-card-foreground shadow-xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancel.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus();
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className="flex items-start gap-3">
            <ConfirmIcon kind={options?.icon ?? (options?.danger ? 'danger' : 'info')} />
            <Dialog.Title className="min-w-0 break-words pt-0.5 text-base font-bold leading-[1.6]">
              {options?.title}
            </Dialog.Title>
          </div>
          <div className="flex flex-col gap-2.5 pl-0 sm:pl-11">
            <Dialog.Description className="break-words text-[13.5px] leading-[1.8] text-muted-foreground">
              {options?.description}
            </Dialog.Description>
            {options?.details && <div className="min-h-0 overflow-y-auto break-words text-sm">{options.details}</div>}
          </div>
          <div className="mt-2.5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end" data-confirm-footer>
            {options?.order === 'danger-first' ? [confirmButton, cancelButton] : [cancelButton, confirmButton]}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
  return { confirm, dialog };
}
