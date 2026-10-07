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
}

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
          className="fixed left-1/2 top-1/2 z-[81] flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xl"
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
          <Dialog.Title className="break-words text-lg font-semibold">{options?.title}</Dialog.Title>
          <Dialog.Description className="break-words text-sm leading-relaxed text-muted-foreground">
            {options?.description}
          </Dialog.Description>
          {options?.details && <div className="min-h-0 overflow-y-auto break-words text-sm">{options.details}</div>}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              ref={cancel}
              type="button"
              onClick={() => finish(false)}
              className="min-h-11 rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {options?.cancelLabel ?? 'やめる'}
            </button>
            <button
              type="button"
              onClick={() => finish(true)}
              className={`min-h-11 rounded-md border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${options?.danger ? 'border-destructive bg-background text-destructive' : 'border-primary-dark bg-primary-dark text-primary-foreground'}`}
            >
              {options?.confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
  return { confirm, dialog };
}
