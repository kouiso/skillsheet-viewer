'use client';

import {
  ArrowLeft,
  ChevronDown,
  Download,
  FileDown,
  FileMinus,
  Loader2,
  Menu,
  Moon,
  PencilLine,
  Sheet,
  Sun,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  Sheet as NavigationSheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/component/ui/sheet';
import './viewer-console.css';

import { Button } from '@/component/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/component/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/component/ui/tooltip';
import { useThemeMode } from '@/context/theme-context';
import { useViewerTopbarHeight } from '@/hook/use-viewer-topbar-height';
import { consoleFontClasses } from './viewer-font';

/**
 * ビューアで表示ON/OFFを切り替えられるキー。
 *
 * 'duration' だけはセクションの出し分けではなく、案件カード・会社レーン・タイムライン・
 * PDF に出る稼働月数（「9ヶ月」等）という表示項目を制御する。トグル機構・初期値（全ON）・
 * PDF への伝搬は他のキーと同じ列に乗せる — 別軸の設定を生やすと画面と PDF で
 * 食い違う経路が増えるため。
 */
export type ViewKey = 'skills' | 'process' | 'projects' | 'timeline' | 'duration';

/** ビュートグルの定義（デザインプロトタイプ redesign2 の ALL_VIEWS と同順 + 末尾に表示項目トグル）。 */
export const ALL_VIEWS: { id: ViewKey; label: string }[] = [
  { id: 'skills', label: 'スキルマトリクス' },
  { id: 'process', label: '工程の俯瞰' },
  { id: 'projects', label: '案件詳細' },
  { id: 'timeline', label: 'タイムライン' },
  { id: 'duration', label: '稼働月数' },
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
  /** Excel ダウンロード（DB シートのみ。未指定ならボタンを出さない）。 */
  onDownloadExcel?: () => void | Promise<void>;
  excelLoading?: boolean;
  /** Word ダウンロード（DB シートのみ。未指定なら Excel メニュー内の選択肢を出さない）。 */
  onDownloadDocx?: () => void | Promise<void>;
  docxLoading?: boolean;
  /** 要約版 PDF ダウンロード。未指定なら要約版ボタンを出さない。 */
  onDownloadPdfDigest?: () => void | Promise<void>;
  /** 要約版 Excel ダウンロード（DB シートのみ）。未指定なら Popover 内の選択肢を出さない。 */
  onDownloadExcelDigest?: () => void | Promise<void>;
  /** 要約版（PDF / Excel どちらか）の生成中。 */
  digestLoading?: boolean;
  /** 編集者ログイン済みか。false のときは編集導線（ビルダーリンク）を出さない。 */
  canEdit?: boolean;
  /** 編集者判定の前後で編集ボタン分の幅を固定する。 */
  reserveEditSlot?: boolean;
}

/**
 * 要約版ダウンロードの Popover メニュー。アイコン 1 個から PDF / Excel を選ぶ。
 * SP 幅ではアイコン 1 個ぶんしか増やせない（44px 刻み）ので選択肢は Popover に畳む。
 * 他のアイコンと違い Tooltip では包まない — Tooltip と Popover の asChild を
 * 1 つの Button に重ねると ref の受け渡しが複雑になるため。名前は aria-label で伝える。
 * 開閉状態は SP / PC で別インスタンスになるよう、このコンポーネントが持つ。
 */
function DigestDownloadMenu({
  onDownloadPdfDigest,
  onDownloadExcelDigest,
  digestLoading,
  labeled = false,
}: {
  onDownloadPdfDigest: () => void | Promise<void>;
  onDownloadExcelDigest?: () => void | Promise<void>;
  digestLoading: boolean;
  /** デスクトップでは文字ラベル＋下向き矢印で「メニューが開く」ことを示す（#397）。 */
  labeled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={labeled ? undefined : 'icon'}
          disabled={digestLoading}
          aria-busy={digestLoading}
          aria-label={digestLoading ? '要約版を生成中' : '要約版をダウンロード'}
          // Popover とは別に、ホバーで用途が分かるネイティブ tooltip（#355）
          title={digestLoading ? '要約版を生成中' : '要約版をダウンロード'}
          // デスクトップでもアイコンだけの帯（<xl）があるため min-w-11 は残す
          className={labeled ? 'min-h-11 min-w-11 gap-1.5 px-2.5 text-[13px]' : 'min-h-11 min-w-11'}
        >
          {digestLoading ? <Loader2 className="motion-safe:animate-spin" /> : <FileMinus />}
          {labeled && (
            <>
              {/* 文字ラベルは xl 以上で出す。1024–1279px だとラベル込みだとヘッダーが
                  2 段に折り返してしまうため、その帯では従来どおりアイコンのみ。 */}
              <span className="hidden xl:inline">要約版</span>
              <ChevronDown className="hidden size-3.5 text-muted-foreground xl:inline" aria-hidden />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={`console-export-menu z-[70] ${consoleFontClasses}`}>
        <div className="flex flex-col">
          <Button
            variant="ghost"
            aria-label="PDF（要約版）ダウンロード"
            onClick={() => {
              setOpen(false);
              void onDownloadPdfDigest();
            }}
          >
            PDF（要約版）
          </Button>
          {onDownloadExcelDigest && (
            <Button
              variant="ghost"
              aria-label="Excel（要約版）ダウンロード"
              onClick={() => {
                setOpen(false);
                void onDownloadExcelDigest();
              }}
            >
              Excel（要約版）
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * SP 用のダウンロードメニュー。PDF / Excel / 要約版を1つの Popover に畳む。
 * SP のアイコン行は「戻るリンク＋アイコン群」を320px に収める必要があり、
 * ボタンを個別に並べるとリンクのタップターゲットが 44px を割る（#337 CI で実測）。
 */
function DownloadMenu({
  onDownloadPdf,
  onDownloadExcel,
  onDownloadDocx,
  onDownloadPdfDigest,
  onDownloadExcelDigest,
  loading,
}: {
  onDownloadPdf?: () => void | Promise<void>;
  onDownloadExcel?: () => void | Promise<void>;
  onDownloadDocx?: () => void | Promise<void>;
  onDownloadPdfDigest?: () => void | Promise<void>;
  onDownloadExcelDigest?: () => void | Promise<void>;
  loading: boolean;
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
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * デスクトップ用の Excel / Word メニュー。docx 追加でボタン枠を増やさないため、
 * Excel ボタンのあった1枠を Popover 化して Office 形式を畳む（要約版メニューと同じ構造）。
 */
function OfficeDownloadMenu({
  onDownloadExcel,
  onDownloadDocx,
  excelLoading,
  docxLoading,
}: {
  onDownloadExcel: () => void | Promise<void>;
  onDownloadDocx?: () => void | Promise<void>;
  excelLoading: boolean;
  docxLoading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const loading = excelLoading || docxLoading;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          disabled={loading}
          aria-busy={loading}
          aria-label={loading ? 'Excel / Wordを生成中' : 'Excel / Wordをダウンロード'}
          title={loading ? 'Excel / Wordを生成中' : 'Excel / Wordをダウンロード'}
          className="min-h-11 min-w-11 gap-1.5 px-2.5 text-[13px]"
        >
          {loading ? <Loader2 className="motion-safe:animate-spin" /> : <Sheet />}
          <span className="hidden xl:inline">Excel</span>
          <ChevronDown className="hidden size-3.5 text-muted-foreground xl:inline" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={`console-export-menu z-[70] ${consoleFontClasses}`}>
        <div className="flex flex-col">
          <Button
            variant="ghost"
            aria-label="Excelダウンロード"
            onClick={() => {
              setOpen(false);
              void onDownloadExcel();
            }}
          >
            Excel
          </Button>
          {onDownloadDocx && (
            <Button
              variant="ghost"
              aria-label="Wordダウンロード"
              onClick={() => {
                setOpen(false);
                void onDownloadDocx();
              }}
            >
              Word
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
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
  onDownloadExcel,
  excelLoading = false,
  onDownloadDocx,
  docxLoading = false,
  onDownloadPdfDigest,
  onDownloadExcelDigest,
  digestLoading = false,
  canEdit = true,
  reserveEditSlot = false,
}: ViewerTopbarProps) {
  const { mode, toggleTheme } = useThemeMode();
  const [navigationOpen, setNavigationOpen] = useState(false);

  // ヘッダー実高を --viewer-topbar-h へ流し、見出し・目次のずらし量と一元化（#397）
  const headerRef = useViewerTopbarHeight<HTMLElement>();

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

  const viewToggleFieldset = (
    <fieldset className="console-view-toggles">
      <legend>表示するビュー</legend>
      {ALL_VIEWS.map((view) => {
        const on = views.includes(view.id);
        return (
          <button
            key={view.id}
            type="button"
            onClick={() => onToggleView(view.id)}
            aria-pressed={on}
            // 値を選ぶタグ(.chip)ではなく操作ボタン(.softbtn)。ドットの色は .softbtn .sdot 側で切り替わる。
            // shrink-0 + whitespace-nowrap: SP の flex-nowrap + overflow-x-auto で
            // 横スクロールさせる設計のため、ボタン自体が潰れて文字が折り返さないようにする。
            className={`softbtn compact shrink-0 whitespace-nowrap ${on ? 'on' : ''}`}
          >
            <span aria-hidden className="sdot" />
            {view.label}
          </button>
        );
      })}
    </fieldset>
  );

  // PC はトップバー、狭幅は Sheet 内へ同じ操作群を置く。
  // CSS で非表示の領域はタブ順からも外れ、表示順と操作順を揃える。
  // 出力ラベルは aria-label/Tooltip でも伝え、狭幅の常設ダウンロードは別メニューにまとめる。
  const renderActionIcons = (className: string, compact = false) => (
    <div className={className}>
      {reserveEditSlot ? (
        <span data-testid="edit-slot" className="size-11 shrink-0">
          {editButton}
        </span>
      ) : (
        editButton
      )}

      {compact && (onDownloadPdf || onDownloadExcel || onDownloadDocx || onDownloadPdfDigest || onDownloadExcelDigest) ? (
        <DownloadMenu
          onDownloadPdf={onDownloadPdf}
          onDownloadExcel={onDownloadExcel}
          onDownloadDocx={onDownloadDocx}
          onDownloadPdfDigest={onDownloadPdfDigest}
          onDownloadExcelDigest={onDownloadExcelDigest}
          loading={pdfLoading || excelLoading || docxLoading || digestLoading}
        />
      ) : (
        <>
          {onDownloadPdf && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size={compact ? 'icon' : undefined}
                  onClick={() => void onDownloadPdf()}
                  disabled={pdfLoading}
                  aria-busy={pdfLoading}
                  aria-label={pdfLoading ? 'PDFを生成中' : 'PDFダウンロード'}
                  className={compact ? 'min-h-11 min-w-11' : 'min-h-11 min-w-11 gap-1.5 px-2.5 text-[13px]'}
                >
                  {pdfLoading ? <Loader2 className="motion-safe:animate-spin" /> : <FileDown />}
                  {!compact && <span className="hidden xl:inline">PDF</span>}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{pdfLoading ? 'PDFを生成中…' : 'PDFをダウンロード'}</TooltipContent>
            </Tooltip>
          )}

          {onDownloadExcel && (
            <OfficeDownloadMenu
              onDownloadExcel={onDownloadExcel}
              onDownloadDocx={onDownloadDocx}
              excelLoading={excelLoading}
              docxLoading={docxLoading}
            />
          )}

          {onDownloadPdfDigest && (
            <DigestDownloadMenu
              onDownloadPdfDigest={onDownloadPdfDigest}
              onDownloadExcelDigest={onDownloadExcelDigest}
              digestLoading={digestLoading}
              labeled={!compact}
            />
          )}
        </>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size={compact ? 'icon' : undefined}
            onClick={toggleTheme}
            aria-label="テーマ切り替え"
            className={compact ? 'min-h-11 min-w-11' : 'min-h-11 min-w-11 gap-1.5 px-2.5 text-[13px]'}
          >
            {mode === 'dark' ? <Sun /> : <Moon />}
            {!compact && <span className="hidden xl:inline">テーマ</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{mode === 'dark' ? 'ライトモード' : 'ダークモード'}</TooltipContent>
      </Tooltip>
    </div>
  );

  const sidebar = (
    <>
      <div className="console-identity">
        <p className="kicker">skillsheet-viewer</p>
        <p className="console-name">{name || 'エンジニアスキルシート'}</p>
        {company && <p className="console-company">{company}</p>}
      </div>
      <Link href="/view" aria-label="シート一覧へ戻る" className="console-back">
        <ArrowLeft className="size-4" aria-hidden="true" />
        シート一覧へ戻る
      </Link>
      {viewToggleFieldset}
      {renderActionIcons('console-actions')}
    </>
  );
  return (
    <header className="console-topbar no-print" ref={headerRef}>
      <div className="console-desktop-bar">
        <Link
          href="/view"
          aria-label="シート一覧へ戻る"
          className="console-back console-back-icon"
          title="シート一覧へ戻る"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
        <div className="console-topbar-identity">
          <span className="console-mark" aria-hidden="true" />
          <span className="console-topbar-name">{name || 'エンジニアスキルシート'}</span>
          {company && <span className="console-topbar-company">{company}</span>}
        </div>
        {viewToggleFieldset}
        {renderActionIcons('console-actions')}
      </div>
      <div className="console-mobile-bar">
        <NavigationSheet open={navigationOpen} onOpenChange={setNavigationOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="min-h-11 min-w-11" aria-label="表示・出力メニューを開く">
              <Menu aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className={`console-drawer ${consoleFontClasses}`}>
            <SheetTitle className="sr-only">スキルシートの表示と出力</SheetTitle>
            <SheetDescription className="sr-only">表示項目、ダウンロード、テーマを変更できます。</SheetDescription>
            {sidebar}
          </SheetContent>
        </NavigationSheet>
        <div className="console-topbar-identity">
          <span className="console-mark" aria-hidden="true" />
          <span className="console-topbar-name">{name || 'エンジニアスキルシート'}</span>
        </div>
        {(onDownloadPdf || onDownloadExcel || onDownloadDocx || onDownloadPdfDigest || onDownloadExcelDigest) && (
          <DownloadMenu
            onDownloadPdf={onDownloadPdf}
            onDownloadExcel={onDownloadExcel}
            onDownloadDocx={onDownloadDocx}
            onDownloadPdfDigest={onDownloadPdfDigest}
            onDownloadExcelDigest={onDownloadExcelDigest}
            loading={pdfLoading || excelLoading || docxLoading || digestLoading}
          />
        )}
      </div>
    </header>
  );
}
