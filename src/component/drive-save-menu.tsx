'use client';

import { CloudUpload, FolderOpen, Loader2 } from 'lucide-react';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { Button } from '@/component/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/component/ui/popover';
import { type DriveSaveController, type DriveSaveKind, useDriveSave } from '@/hook/use-drive-save';
import type { ExportEdition } from '@/lib/export/edition';
import { consoleFontClasses } from './viewer-font';

/**
 * 「Driveに保存」メニュー（オーナー専用）。
 *
 * Drive の設定・トークン・アップロードの窓口は useDriveSave にまとめ、
 * DriveSaveProvider が Context 経由で配る。Provider が trpc を使うため、
 * tRPC Provider の無い描画（既存の単体テストなど）に備え、canEdit=false なら
 * trpc を呼ばない内側コンポーネントごと描かない — hooks の条件呼び出し回避のため、
 * 外側（条件分岐）と内側（hook 呼び出し）で別コンポーネントにしている。
 * PC は ☁ アイコンの Popover（DriveSaveMenu）。SP は DownloadMenu に
 * DriveSaveSection を区切りとして差し込む。
 */

const DriveSaveContext = createContext<DriveSaveController | null>(null);

export function useDriveSaveContext(): DriveSaveController | null {
  return useContext(DriveSaveContext);
}

export function DriveSaveProvider({
  canEdit,
  buildFile,
  children,
}: {
  canEdit: boolean;
  buildFile: (kind: DriveSaveKind, edition: ExportEdition) => Promise<{ blob: Blob; title: string }>;
  children: ReactNode;
}) {
  // 閲覧者は Drive 機能自体を持たない（Google スクリプトも読まない）。
  if (!canEdit) return <>{children}</>;
  return <DriveSaveProviderInner buildFile={buildFile}>{children}</DriveSaveProviderInner>;
}

function DriveSaveProviderInner({
  buildFile,
  children,
}: {
  buildFile: (kind: DriveSaveKind, edition: ExportEdition) => Promise<{ blob: Blob; title: string }>;
  children: ReactNode;
}) {
  const drive = useDriveSave({ canEdit: true, buildFile });
  return <DriveSaveContext.Provider value={drive}>{children}</DriveSaveContext.Provider>;
}

function SaveButtons({ drive, canSaveExcel }: { drive: DriveSaveController; canSaveExcel: boolean }) {
  return (
    <>
      <Button
        variant="ghost"
        disabled={drive.saving}
        aria-label="PDFをDriveに保存"
        onClick={() => void drive.save('pdf', 'full')}
      >
        PDF
      </Button>
      {canSaveExcel && (
        <Button
          variant="ghost"
          disabled={drive.saving}
          aria-label="ExcelをDriveに保存"
          onClick={() => void drive.save('xlsx', 'full')}
        >
          Excel
        </Button>
      )}
      <Button
        variant="ghost"
        disabled={drive.saving}
        aria-label="PDF（要約版）をDriveに保存"
        onClick={() => void drive.save('pdf', 'digest')}
      >
        PDF（要約版）
      </Button>
      {canSaveExcel && (
        <Button
          variant="ghost"
          disabled={drive.saving}
          aria-label="Excel（要約版）をDriveに保存"
          onClick={() => void drive.save('xlsx', 'digest')}
        >
          Excel（要約版）
        </Button>
      )}
    </>
  );
}

/** メニュー内項目（保存先表示・変更・各保存ボタン）。Context から drive を読む。 */
function MenuItems({ drive, canSaveExcel }: { drive: DriveSaveController; canSaveExcel: boolean }) {
  if (drive.settingError) {
    return <p className="px-3 py-2 text-sm text-muted-foreground">{drive.settingError}</p>;
  }
  if (!drive.destination) {
    return (
      <Button
        variant="ghost"
        disabled={drive.preparing || drive.picking}
        aria-label="Driveの保存先を選ぶ"
        onClick={() => void drive.pickFolder()}
      >
        {drive.picking || drive.preparing ? <Loader2 className="motion-safe:animate-spin" /> : <FolderOpen />}
        保存先を選ぶ
      </Button>
    );
  }
  return (
    <>
      <div className="flex items-center justify-between gap-1 px-3 py-1.5 text-sm text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <FolderOpen className="size-4 shrink-0" aria-hidden />
          <span className="truncate">保存先: {drive.destination.folderName}</span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={drive.preparing || drive.picking}
          aria-label="Driveの保存先を変更"
          onClick={() => void drive.pickFolder()}
        >
          変更
        </Button>
      </div>
      <SaveButtons drive={drive} canSaveExcel={canSaveExcel} />
    </>
  );
}

/** DownloadMenu の末尾へ差し込む Drive 区切り。Provider が無い・無効な環境では何も出さない。 */
export function DriveSaveSection({ canSaveExcel }: { canSaveExcel: boolean }) {
  const drive = useDriveSaveContext();
  if (!drive?.available) return null;
  return (
    <>
      <div className="mx-3 my-1 border-t border-border" aria-hidden />
      <span className="px-3 pt-1 text-xs font-semibold text-muted-foreground">Driveに保存</span>
      <MenuItems drive={drive} canSaveExcel={canSaveExcel} />
    </>
  );
}

/** PC 用の ☁ アイコン Popover。Provider が無い・無効な環境では描かない。 */
export function DriveSaveMenu({ canSaveExcel }: { canSaveExcel: boolean }) {
  const [open, setOpen] = useState(false);
  const drive = useDriveSaveContext();
  if (!drive?.available) return null;
  const busy = drive.saving || drive.picking;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          disabled={busy}
          aria-busy={busy}
          aria-label={busy ? 'Driveに保存中' : 'Driveに保存'}
          title={busy ? 'Driveに保存中' : 'Driveに保存'}
          className="min-h-11 min-w-11 gap-1.5 px-2.5 text-[13px]"
        >
          {busy ? <Loader2 className="motion-safe:animate-spin" /> : <CloudUpload />}
          <span className="hidden xl:inline">Drive</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className={`console-export-menu z-[70] ${consoleFontClasses}`}>
        <div className="flex flex-col">
          <span className="px-3 pt-2 text-xs font-semibold text-muted-foreground">Driveに保存</span>
          <MenuItems drive={drive} canSaveExcel={canSaveExcel} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
