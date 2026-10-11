'use client';

import { Download, Loader2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/component/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/component/ui/popover';
import { consoleFontClasses } from './viewer-font';

/**
 * SP 用のダウンロードメニュー。PDF / Excel / 要約版を1つの Popover に畳む。
 * SP のアイコン行は「戻るリンク＋アイコン群」を320px に収める必要があり、
 * ボタンを個別に並べるとリンクのタップターゲットが 44px を割る（#337 CI で実測）。
 * viewer-topbar から切り出し、ヘッダー（header.tsx）でも使う（#384）。
 * Drive 保存など追加のセクションは driveSection として末尾に差し込める。
 */
export function DownloadMenu({
  onDownloadPdf,
  onDownloadExcel,
  onDownloadDocx,
  onDownloadPdfDigest,
  onDownloadExcelDigest,
  loading,
  driveSection,
}: {
  onDownloadPdf?: () => void | Promise<void>;
  onDownloadExcel?: () => void | Promise<void>;
  onDownloadDocx?: () => void | Promise<void>;
  onDownloadPdfDigest?: () => void | Promise<void>;
  onDownloadExcelDigest?: () => void | Promise<void>;
  loading: boolean;
  /** 「Driveに保存」区切りなど、ダウンロード項目の後に出す追加セクション。 */
  driveSection?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const item = (label: string, action: () => void | Promise<void>, ariaLabel: string) => (
    <Button
      variant="ghost"
      aria-label={ariaLabel}
      onClick={() => {
        setOpen(false);
        void action();
      }}
    >
      {label}
    </Button>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={loading}
          aria-busy={loading}
          aria-label={loading ? 'ダウンロードを生成中' : 'ダウンロード'}
          className="min-h-11 min-w-11"
        >
          {loading ? <Loader2 className="motion-safe:animate-spin" /> : <Download />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={`console-export-menu z-[70] ${consoleFontClasses}`}>
        <div className="flex flex-col">
          {onDownloadPdf && item('PDF', onDownloadPdf, 'PDFダウンロード')}
          {onDownloadExcel && item('Excel', onDownloadExcel, 'Excelダウンロード')}
          {onDownloadDocx && item('Word', onDownloadDocx, 'Wordダウンロード')}
          {onDownloadPdfDigest && item('PDF（要約版）', onDownloadPdfDigest, 'PDF（要約版）ダウンロード')}
          {onDownloadExcelDigest && item('Excel（要約版）', onDownloadExcelDigest, 'Excel（要約版）ダウンロード')}
          {driveSection}
        </div>
      </PopoverContent>
    </Popover>
  );
}
