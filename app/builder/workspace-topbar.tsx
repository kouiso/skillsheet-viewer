'use client';

import {
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  History,
  Moon,
  MoreHorizontal,
  Plus,
  Save,
  Sun,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { type MouseEvent, type ReactNode, useState } from 'react';
import { Button } from '@/component/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/component/ui/popover';

type Sheet = { id: string; title: string; updatedAt: Date };

const SAVED_AT_FORMAT = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// デザインボード（N-05）は「最終保存 9/24 12:41」。年・秒は出さず、月日と時刻だけにする。
function formatSheetSavedAt(value: Date | string): string {
  const parts = Object.fromEntries(
    SAVED_AT_FORMAT.formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  );
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

export function WorkspaceTopbar({
  sheets,
  activeSheetId,
  title,
  status,
  disabled,
  busy,
  saving,
  saveBusy = saving,
  dark,
  showPreview,
  previewAvailable = true,
  onSelectSheet,
  onCreateSheet,
  onDeleteSheet,
  onExport,
  onHistory,
  onVersionHistory,
  onToggleTheme,
  onTogglePreview,
  onOpenPreview,
  onSave,
  onView,
}: {
  sheets: Sheet[];
  activeSheetId: string;
  title: string;
  status: ReactNode;
  disabled: boolean;
  busy: boolean;
  saving: boolean;
  saveBusy?: boolean;
  dark: boolean;
  showPreview: boolean;
  previewAvailable?: boolean;
  onSelectSheet: (id: string) => void;
  onCreateSheet: () => void;
  onDeleteSheet: (id: string, title: string) => void;
  onExport: () => void;
  onHistory: () => void;
  onVersionHistory?: () => void;
  onToggleTheme: () => void;
  onTogglePreview: () => void;
  onOpenPreview: () => void;
  onSave: () => void;
  onView: () => boolean | Promise<boolean>;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const action = (callback: () => void) => {
    setMoreOpen(false);
    callback();
  };
  const view = (event: MouseEvent<HTMLAnchorElement>) => {
    const answer = onView();
    if (typeof answer === 'boolean') {
      if (!answer) event.preventDefault();
      else setMoreOpen(false);
      return;
    }
    event.preventDefault();
    void answer.then((allowed) => {
      if (allowed) {
        setMoreOpen(false);
        window.location.assign('/');
      }
    });
  };
  return (
    <header
      data-slot="builder-topbar"
      className="no-print sticky top-0 z-20 border-b border-border bg-card [&_button]:min-h-11 [&_a]:min-h-11"
    >
      <div className="flex min-h-14 min-w-0 flex-wrap items-center gap-2 px-2 sm:gap-2 sm:px-3 lg:flex-nowrap">
        <Popover open={sheetOpen} onOpenChange={setSheetOpen}>
          <PopoverTrigger asChild>
            <Button
              data-workspace-focus
              variant="ghost"
              className="min-w-0 flex-1 justify-start gap-2 border border-transparent px-2.5 sm:max-w-[340px] sm:flex-none data-[state=open]:border-border data-[state=open]:bg-muted"
              aria-label={`シートを切り替える: ${title || 'シート未選択'}`}
            >
              <span className="hidden items-center gap-2 xl:inline-flex">
                <span className="text-xs font-semibold text-muted-foreground">スキルシートビルダー</span>
                <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
              </span>
              <span className="truncate text-[14.5px] font-bold">{title || 'シート未選択'}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[min(340px,calc(100vw-16px))] min-w-60 rounded-md border-border-strong p-1"
            aria-label="シートを切り替える"
          >
            <h2 className="px-2.5 pb-1 pt-2 text-xs font-bold text-muted-foreground">シート</h2>
            <ul className="max-h-[60dvh] overflow-y-auto">
              {sheets.map((sheet) => {
                const active = sheet.id === activeSheetId;
                return (
                  <li
                    key={sheet.id}
                    data-sheet-row
                    className="group relative flex min-w-0 items-center gap-2 rounded hover:bg-muted focus-within:bg-muted"
                  >
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`「${sheet.title}」に切り替える`}
                      aria-current={active ? 'true' : undefined}
                      onClick={() => {
                        setSheetOpen(false);
                        onSelectSheet(sheet.id);
                      }}
                      className={`flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded px-2.5 text-left text-[13px] disabled:opacity-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${active ? 'font-semibold text-accent-text' : ''}`}
                    >
                      {active ? (
                        <Check className="size-4 shrink-0 text-accent-text" />
                      ) : (
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{sheet.title}</span>
                        <span className="block text-xs font-normal text-muted-foreground">
                          最終保存 {formatSheetSavedAt(sheet.updatedAt)}
                        </span>
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      aria-label={`「${sheet.title}」を削除`}
                      title={`「${sheet.title}」を削除`}
                      className="mr-1 size-8 shrink-0 text-muted-foreground opacity-0 pointer-coarse:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => {
                        setSheetOpen(false);
                        onDeleteSheet(sheet.id, sheet.title);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
            <hr className="my-1 h-px border-0 bg-border" />
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setSheetOpen(false);
                onCreateSheet();
              }}
              className="flex min-h-10 w-full items-center gap-2.5 rounded px-2.5 text-left text-[13px] hover:bg-muted disabled:opacity-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              <Plus className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">新しいシートを作る…</span>
            </button>
          </PopoverContent>
        </Popover>
        {onVersionHistory && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label="版の履歴を開く"
            title="版の履歴"
            onClick={onVersionHistory}
          >
            <History className="size-4" />
          </Button>
        )}
        <div className="order-last w-full min-w-0 pb-2 lg:order-none lg:w-auto lg:pb-0">{status}</div>
        <div className="hidden flex-1 sm:block" />
        <Button
          variant="outline"
          className="hidden min-[1181px]:inline-flex"
          aria-pressed={showPreview}
          disabled={!previewAvailable}
          onClick={onTogglePreview}
        >
          プレビュー
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:inline-flex"
          disabled={disabled}
          aria-label="プレビューを別ウィンドウで開く"
          onClick={onOpenPreview}
        >
          <ExternalLink className="size-4" />
        </Button>
        <Button asChild variant="ghost" className="hidden md:inline-flex">
          <Link href="/view" onClick={view}>
            閲覧へ
          </Link>
        </Button>
        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="その他の操作">
              <MoreHorizontal className="size-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(300px,calc(100vw-16px))] p-2" aria-label="その他の操作">
            <Button
              variant="ghost"
              disabled={disabled}
              className="w-full justify-start md:hidden"
              onClick={() => action(onOpenPreview)}
            >
              <ExternalLink className="size-4" />
              別ウィンドウでプレビュー
            </Button>
            <Button asChild variant="ghost" className="w-full justify-start md:hidden">
              <Link href="/view" onClick={view}>
                <ExternalLink className="size-4" />
                閲覧画面へ
              </Link>
            </Button>
            <Button
              variant="ghost"
              disabled={disabled}
              className="h-auto min-h-11 w-full justify-start py-2"
              onClick={() => action(onExport)}
            >
              <Download className="size-4 shrink-0" />
              <span className="text-left">
                バックアップを書き出す
                <span className="block text-xs text-muted-foreground">Markdown（非表示の会社・案件も含む）</span>
              </span>
            </Button>

            <Button
              variant="ghost"
              className="h-auto min-h-11 w-full justify-start py-2"
              onClick={() => action(onHistory)}
            >
              <History className="size-4 shrink-0" />
              <span className="text-left">
                この端末の入力履歴
                <span className="block text-xs text-muted-foreground">このブラウザだけ・案件のみ</span>
              </span>
            </Button>
            <Button variant="ghost" className="w-full justify-start" onClick={() => action(onToggleTheme)}>
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {dark ? 'ライトテーマにする' : 'ダークテーマにする'}
            </Button>
            <Button
              variant="ghost"
              disabled={busy || !activeSheetId}
              className="mt-2 w-full justify-start border-t border-border text-destructive"
              onClick={() => action(() => onDeleteSheet(activeSheetId, title))}
            >
              <Trash2 className="size-4" />
              このシートを削除…
            </Button>
          </PopoverContent>
        </Popover>
        <Button
          disabled={disabled || !activeSheetId || saveBusy}
          onClick={onSave}
          aria-label={saving ? '保存中' : '保存'}
          // 保存操作が再び可能になった瞬間、文字も不透明へ戻す。
          className="shrink-0 px-3 transition-[background-color,color,box-shadow]"
        >
          <Save className="size-4" />
          <span className="hidden sm:inline">{saving ? '保存中…' : '保存'}</span>
        </Button>
      </div>
    </header>
  );
}
