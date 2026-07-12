'use client';

import { motion } from 'framer-motion';
import { FileDown, Moon, PencilLine, Sun } from 'lucide-react';
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
}: ViewerTopbarProps) {
  const { mode, toggleTheme } = useThemeMode();

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="no-print sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="size-[9px] rounded-[2px] bg-primary" />
          <span className="text-[15px] font-semibold text-foreground">{name || 'エンジニアスキルシート'}</span>
          {company && <span className="font-mono text-[11.5px] text-faint">{company}</span>}
        </div>

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
                className={`chip gap-1.5 ${on ? 'on' : ''}`}
              >
                {/* ON時はチップ前景色（on-accent）、OFF時は faint のドット */}
                <span
                  aria-hidden
                  className="size-[7px] rounded-full"
                  style={{ background: on ? 'currentColor' : 'var(--faint)' }}
                />
                {view.label}
              </button>
            );
          })}
        </fieldset>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" asChild aria-label="編集／ビルダー">
                <Link href="/builder">
                  <PencilLine />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>編集／ビルダー</TooltipContent>
          </Tooltip>

          {onDownloadPdf && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void onDownloadPdf()}
                  disabled={pdfLoading}
                  aria-label="PDFダウンロード"
                >
                  <FileDown />
                </Button>
              </TooltipTrigger>
              <TooltipContent>PDFをダウンロード</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="テーマ切り替え">
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
