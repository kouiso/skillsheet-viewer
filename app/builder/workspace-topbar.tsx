'use client';

import {
  ChevronDown,
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
              className="min-w-0 flex-1 justify-start px-2 sm:max-w-80 sm:flex-none"
              aria-label={`シートを切り替える: ${title || 'シート未選択'}`}
            >
              <span className="hidden text-xs text-muted-foreground xl:inline">スキルシートビルダー</span>
              <span className="truncate font-semibold">{title || 'シート未選択'}</span>
              <ChevronDown className="size-4 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(340px,calc(100vw-16px))] p-2" aria-label="シートを切り替える">
            <h2 className="px-2 py-2 text-xs font-semibold text-muted-foreground">シート</h2>
            <ul className="max-h-[60dvh] overflow-y-auto">
              {sheets.map((sheet) => (
                <li key={sheet.id} className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`「${sheet.title}」に切り替える`}
                    aria-current={sheet.id === activeSheetId ? 'true' : undefined}
                    onClick={() => {
                      setSheetOpen(false);
                      onSelectSheet(sheet.id);
                    }}
                    className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded px-2 text-left text-sm disabled:opacity-50 ${sheet.id === activeSheetId ? 'bg-primary-dark text-primary-foreground' : 'hover:bg-muted'}`}
                  >
                    <FileText className="size-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate">{sheet.title}</span>
                      <span className="block text-xs opacity-90">
                        最終保存 {new Date(sheet.updatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                      </span>
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    aria-label={`「${sheet.title}」を削除`}
                    onClick={() => {
                      setSheetOpen(false);
                      onDeleteSheet(sheet.id, sheet.title);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setSheetOpen(false);
                onCreateSheet();
              }}
              className="mt-2 w-full justify-start border-t border-border"
            >
              <Plus className="size-4" />
              新しいシートを作る…
            </Button>
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
