import { ChevronLeft, ChevronRight, Menu as MenuIcon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import useMediaQuery from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

interface Heading {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  headings: Heading[];
  activeId: string;
  onHeadingClick: (id: string) => void;
}

export const SIDEBAR_WIDTH = 280;
/** 折りたたみ時の幅。ドットだけが縦に並ぶ（現在位置は分かるが本文の邪魔をしない）。 */
export const SIDEBAR_COLLAPSED_WIDTH = 52;

interface TocListProps {
  headings: Heading[];
  activeId: string;
  onHeadingClick: (id: string) => void;
  collapsed?: boolean;
}

const TocList = ({ headings, activeId, onHeadingClick, collapsed }: TocListProps) => (
  <ul className="flex flex-1 list-none flex-col gap-px overflow-y-auto p-0">
    {headings.map((heading) => {
      const isActive = heading.id === activeId;
      return (
        <li key={heading.id}>
          <button
            type="button"
            onClick={() => onHeadingClick(heading.id)}
            aria-current={isActive ? 'true' : undefined}
            title={collapsed ? heading.text : undefined}
            // globals.css の `* { border-color: var(--border) }` はレイヤ外なので
            // Tailwind の border-* ユーティリティより後段になる。枠線の色だけインラインで指定する。
            style={{
              borderColor: isActive ? 'color-mix(in srgb, var(--primary) 35%, transparent)' : 'transparent',
            }}
            className={cn(
              'flex w-full items-center gap-[9px] rounded-[var(--radius)] border text-left leading-[1.5] transition-all duration-150',
              'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
              collapsed ? 'justify-center px-0 py-[9px]' : 'px-2.5 py-[7px]',
              // 3階層目は 1 段下げて、見出しの入れ子が分かるようにする
              !collapsed && heading.level >= 3 ? 'pl-[26px] text-xs' : 'text-[12.5px]',
              isActive
                ? 'bg-accent-soft font-semibold text-accent-text'
                : 'text-muted-foreground hover:bg-surface3 hover:text-foreground',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'shrink-0 rounded-full transition-all duration-150',
                isActive ? 'size-1.5 bg-primary' : 'size-[5px] bg-faint',
              )}
            />
            {!collapsed && <span className="truncate">{heading.text}</span>}
          </button>
        </li>
      );
    })}
  </ul>
);

const TableOfContents = ({ headings, activeId, onHeadingClick }: TableOfContentsProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 899px)');

  const handleHeadingClick = (id: string) => {
    onHeadingClick(id);
    if (isMobile) setMobileOpen(false);
  };

  // モバイル: 右下FAB + Sheet（左から）
  if (isMobile) {
    return (
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button
            size="icon"
            variant="outline"
            className="no-print fixed bottom-4 right-4 z-50 size-11 rounded-full bg-card text-accent-text shadow-[0_6px_20px_-10px_rgba(0,0,0,0.4)] hover:border-primary"
            aria-label="目次を開く"
          >
            <MenuIcon />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-72 flex-col gap-4 px-[22px] py-7">
          {/* スクリーンリーダー向けに Dialog の Title/Description を提供（Radix のa11y要件・警告回避） */}
          <div className="sr-only">
            <SheetTitle>目次</SheetTitle>
            <SheetDescription>ドキュメントの見出し一覧</SheetDescription>
          </div>
          <span className="kicker">Contents</span>
          <TocList headings={headings} activeId={activeId} onHeadingClick={handleHeadingClick} />
        </SheetContent>
      </Sheet>
    );
  }

  // デスクトップ: スティッキーなフレックスサイドバー。
  // position:fixed + 固定marginを使わず flex で隣接させることで、折りたたみ時・印刷時に
  // メインコンテンツが自動的に幅を詰める（余白バグの根本対処）。
  return (
    <aside
      className={cn(
        'no-print sticky top-16 z-30 flex h-[calc(100vh-4rem)] shrink-0 flex-col gap-4 self-start border-r border-border transition-[width] duration-300',
        isCollapsed ? 'items-center px-2 pb-10 pt-7' : 'px-[22px] pb-10 pt-7',
      )}
      style={{ width: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
    >
      <div className={cn('flex w-full items-center gap-2.5', isCollapsed ? 'justify-center' : 'justify-between')}>
        {!isCollapsed && <span className="kicker">Contents</span>}
        <button
          type="button"
          onClick={() => setIsCollapsed((v) => !v)}
          aria-label={isCollapsed ? '目次を開く' : '目次を折りたたむ'}
          aria-expanded={!isCollapsed}
          className="grid size-6 shrink-0 place-items-center rounded-[var(--radius)] border border-border bg-card font-mono text-[11px] text-faint transition-all duration-150 hover:border-primary hover:text-accent-text"
        >
          {isCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
        </button>
      </div>
      <TocList headings={headings} activeId={activeId} onHeadingClick={handleHeadingClick} collapsed={isCollapsed} />
    </aside>
  );
};

export default TableOfContents;
