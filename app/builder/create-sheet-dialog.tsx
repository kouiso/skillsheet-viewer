'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useRef } from 'react';
import { Button } from '@/component/ui/button';
import { TEMPLATES } from './sheet-template';

// ボードの .b は見た目 36px、390 では 44px（use-workspace-confirm と同じ寸法）。
const FOOTER_BUTTON = 'h-11 w-full px-3 text-[13px] min-[480px]:h-9 min-[480px]:w-auto';

const descriptions: Record<string, string> = {
  blank: 'ブロックなしで始める',
  profile: '見出しと項目表',
  full: 'プロファイル・スキル・職務経歴',
  'console-dashboard': 'プロフィール・統計・スキル・案件',
};
export function CreateSheetDialog({
  title,
  templateId,
  busy,
  error,
  onTitleChange,
  onTemplateChange,
  onClose,
  onCreate,
}: {
  title: string;
  templateId: string;
  busy: boolean;
  error: string | null;
  onTitleChange: (value: string) => void;
  onTemplateChange: (value: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document.querySelector<HTMLButtonElement>('[data-workspace-focus]')?.focus();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            titleRef.current?.focus();
          }}
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-card p-5 text-foreground shadow-xl min-[480px]:p-6"
        >
          <Dialog.Title className="pt-0.5 text-base font-bold leading-[1.6]">新しいシートを作る</Dialog.Title>
          <form
            className="mt-2.5 flex flex-col gap-2.5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy && title.trim()) onCreate();
            }}
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="new-sheet-title" className="text-xs font-semibold text-muted-foreground">
                タイトル
              </label>
              <input
                ref={titleRef}
                id="new-sheet-title"
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                disabled={busy}
                className="min-h-10 w-full rounded border border-border-strong bg-card px-3 py-2 text-[13.5px] leading-[1.7] focus-visible:outline-2 focus-visible:outline-ring"
              />
            </div>
            <fieldset disabled={busy} className="flex min-w-0 flex-col gap-1.5">
              <legend className="mb-0 text-xs font-semibold text-muted-foreground">テンプレート</legend>
              <div className="grid grid-cols-2 gap-2">
                {TEMPLATES.map((template) => {
                  const selected = templateId === template.id;
                  return (
                    <label
                      key={template.id}
                      className={`relative flex min-h-11 min-w-0 cursor-pointer flex-col gap-[3px] rounded-md border px-3 py-2.5 text-left has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring ${selected ? 'border-primary bg-accent-soft ring-1 ring-primary' : 'border-border-strong bg-card'}`}
                    >
                      <input
                        type="radio"
                        name="sheet-template"
                        value={template.id}
                        checked={selected}
                        onChange={() => onTemplateChange(template.id)}
                        className="sr-only"
                      />
                      <span className={`block text-[13px] font-bold ${selected ? 'text-accent-text' : ''}`}>
                        {template.label}
                      </span>
                      <span className="block text-xs leading-normal text-muted-foreground">
                        {descriptions[template.id]}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="rounded border border-destructive p-3 text-sm">
                {error} 入力内容は保持しています。もう一度作成できます。
              </p>
            )}
            <div className="mt-2.5 flex flex-col-reverse gap-2 min-[480px]:flex-row min-[480px]:justify-end">
              <Button type="button" variant="outline" className={FOOTER_BUTTON} disabled={busy} onClick={onClose}>
                やめる
              </Button>
              <Button type="submit" className={FOOTER_BUTTON} disabled={busy || !title.trim()}>
                {busy ? '作成中…' : '作る'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
