'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useRef } from 'react';
import { Button } from '@/component/ui/button';
import { TEMPLATES } from './sheet-template';

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
          className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-card p-6 text-foreground shadow-xl"
        >
          <Dialog.Title className="mb-2 text-lg font-semibold">新規シートを作成</Dialog.Title>
          <Dialog.Description className="mb-5 text-sm text-muted-foreground">
            タイトルとテンプレートを選んで、新しいシートを作ります。
          </Dialog.Description>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy && title.trim()) onCreate();
            }}
          >
            <label htmlFor="new-sheet-title" className="mb-1 block text-sm font-medium">
              タイトル
            </label>
            <input
              ref={titleRef}
              id="new-sheet-title"
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              disabled={busy}
              className="min-h-11 w-full rounded border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
            />
            <fieldset disabled={busy} className="my-5">
              <legend className="mb-2 text-sm font-medium">テンプレート</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {TEMPLATES.map((template) => (
                  <label
                    key={template.id}
                    className={`flex min-h-20 cursor-pointer items-start gap-2 rounded border p-3 ${templateId === template.id ? 'border-primary bg-accent text-accent-foreground' : 'border-border bg-background'}`}
                  >
                    <input
                      type="radio"
                      name="sheet-template"
                      value={template.id}
                      checked={templateId === template.id}
                      onChange={() => onTemplateChange(template.id)}
                      className="mt-1 size-4 accent-primary"
                    />
                    <span>
                      <span className="block text-sm font-semibold">{template.label}</span>
                      <span className="block text-xs">{descriptions[template.id]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="mb-4 rounded border border-destructive p-3 text-sm">
                {error} 入力内容は保持しています。もう一度作成できます。
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
                キャンセル
              </Button>
              <Button type="submit" disabled={busy || !title.trim()}>
                {busy ? '作成中…' : '作成'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
