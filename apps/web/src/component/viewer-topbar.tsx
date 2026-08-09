'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, FileDown, Moon, PencilLine, Sun } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useThemeMode } from '@/context/theme-context';

/** ビューアで表示ON/OFFを切り替えられるセクションのキー。 */
export type ViewKey = 'skills' | 'process' | 'projects' | 'timeline';

/** ビュートグルの定義（デザインプロトタイプ redesign2 の ALL_VIEWS と同順）。 */
export const ALL_VIEWS: { id: ViewKey; label: string }[] = [
  { id: 'skills', label: 'スキルマトリクス' },
  { id: 'process', label: '工程の俯瞰' },
  { id: 'projects', label: '案件詳細' },
  { id: 'timeline', label: 'タイムライン' },
];

/** 全ビューONの初期値。 */
export const ALL_VIEW_KEYS: ViewKey[] = ALL_VIEWS.map((v) => v.id);

interface ViewerTopbarProps {
  /** プロフィールの氏名。未設定時は既定タイトルを表示する。 */
  name?: string;
  /** 所属会社名（プロフィールブロックの company）。 */
  company?: string;
  /** 現在ONのビュー。 */
  views: ViewKey[];
  /** ビューのON/OFFトグル。 */
  onToggleView: (view: ViewKey) => void;
  onDownloadPdf?: () => void | Promise<void>;
  pdfLoading?: boolean;
  /** 編集者ログイン済みか。false のときは編集導線（ビルダーリンク）を出さない。 */
  canEdit?: boolean;
  /** 編集者判定の前後で編集ボタン分の幅を固定する。 */
  reserveEditSlot?: boolean;
}

// ダッシュボードシート用の Console トップバー（redesign2 の topbar 変種）。
// アクセント正方形＋氏名＋会社名（mono）、ビュー表示ON/OFFピル、
// ビルダーリンク・PDFダウンロード・テーマ切替を1列（狭幅では折返し）に収める。
export function ViewerTopbar({
  name,
  company,
  views,
  onToggleView,
  onDownloadPdf,
  pdfLoading = false,
  canEdit = true,
  reserveEditSlot = false,
}: ViewerTopbarProps) {
  const { mode, toggleTheme } = useThemeMode();
  const editButton = canEdit ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" asChild aria-label="編集／ビルダー" className="min-h-11 min-w-11">
          <Link href="/builder">
            <PencilLine />
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>編集／ビルダー</TooltipContent>
    </Tooltip>
  ) : null;

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      // design: 背景は下地を 88% 残した色 + blur 8px（カード色ではなくページ地の色を敷く）
      className="no-print sticky top-0 z-40 border-b border-border bg-[color-mix(in_srgb,var(--background)_88%,transparent)] backdrop-blur-[8px]"
    >
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-8">
        <Link
          href="/view"
          className="flex min-h-11 items-center gap-2.5 rounded-md -mx-1.5 px-1.5 transition-colors hover:bg-accent"
          aria-label="シート一覧へ戻る"
        >
          <ArrowLeft className="size-4 text-muted-foreground" aria-hidden="true" />
          <span aria-hidden className="size-[9px] rounded-[2px] bg-primary" />
          <span className="text-[15px] font-semibold text-foreground">{name || 'エンジニアスキルシート'}</span>
          {company && <span className="font-mono text-[11.5px] text-faint">{company}</span>}
        </Link>

        <div className="min-w-4 flex-1" />

        <fieldset className="m-0 flex flex-wrap items-center gap-1.5 border-0 p-0">
          <legend className="sr-only">表示するビュー</legend>
          {ALL_VIEWS.map((view) => {
            const on = views.includes(view.id);
            return (
              <button
                key={view.id}
                type="button"
                onClick={() => onToggleView(view.id)}
                aria-pressed={on}
                // 値を選ぶタグ(.chip)ではなく操作ボタン(.softbtn)。ドットの色は .softbtn .sdot 側で切り替わる。
                className={`softbtn compact ${on ? 'on' : ''}`}
              >
                <span aria-hidden className="sdot" />
                {view.label}
              </button>
            );
          })}
        </fieldset>

        <div className="flex items-center gap-1">
          {reserveEditSlot ? (
            <span data-testid="edit-slot" className="size-11 shrink-0">
              {editButton}
            </span>
          ) : (
            editButton
          )}

          {onDownloadPdf && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void onDownloadPdf()}
                  disabled={pdfLoading}
                  aria-label="PDFダウンロード"
                  className="min-h-11 min-w-11"
                >
                  <FileDown />
                </Button>
              </TooltipTrigger>
              <TooltipContent>PDFをダウンロード</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                aria-label="テーマ切り替え"
                className="min-h-11 min-w-11"
              >
                {mode === 'dark' ? <Sun /> : <Moon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{mode === 'dark' ? 'ライトモード' : 'ダークモード'}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </motion.header>
  );
}
