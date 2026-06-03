import { useState } from 'react';

import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, ChevronDown, ChevronUp, Menu as MenuIcon } from 'lucide-react';

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

// 見出し出現アニメーションのスタッガー間隔（秒）と階層インデント（rem/レベル）
const STAGGER_DELAY_SEC = 0.02;
const INDENT_REM_PER_LEVEL = 0.75;

interface TocListProps {
  headings: Heading[];
  activeId: string;
  onHeadingClick: (id: string) => void;
}

const TocList = ({ headings, activeId, onHeadingClick }: TocListProps) => (
  <nav className="flex-1 overflow-y-auto p-2">
    <ul className="space-y-0.5">
      <AnimatePresence>
        {headings.map((heading, index) => {
          const isActive = heading.id === activeId;
          return (
            <motion.li
              key={heading.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2, delay: index * STAGGER_DELAY_SEC }}
              style={{ paddingLeft: `${(heading.level - 1) * INDENT_REM_PER_LEVEL}rem` }}
            >
              <button
                type="button"
                onClick={() => onHeadingClick(heading.id)}
                className={cn(
                  'w-full rounded-md px-3 py-1.5 text-left transition-colors',
                  heading.level === 1 ? 'text-[0.95rem]' : 'text-sm',
                  isActive
                    ? 'bg-primary font-semibold text-primary-foreground hover:bg-primary-dark'
                    : cn('text-foreground hover:bg-accent', heading.level === 1 && 'font-semibold'),
                )}
              >
                {heading.text}
              </button>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  </nav>
);

const TocHeader = ({ children }: { children?: React.ReactNode }) => (
  <div className="flex items-center justify-between border-b border-border p-4">
    <div className="flex items-center gap-2">
      <BookOpen className="size-5 text-primary" />
      <span className="text-base font-bold">目次</span>
    </div>
    {children}
  </div>
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
            className="no-print fixed bottom-4 right-4 z-50 size-12 rounded-full shadow-elevation-4"
            aria-label="目次を開く"
          >
            <MenuIcon />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-72 flex-col p-0">
          {/* スクリーンリーダー向けに Dialog の Title/Description を提供（Radix のa11y要件・警告回避） */}
          <div className="sr-only">
            <SheetTitle>目次</SheetTitle>
            <SheetDescription>ドキュメントの見出し一覧</SheetDescription>
          </div>
          <TocHeader />
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
      className="no-print sticky top-16 z-30 flex h-[calc(100vh-4rem)] shrink-0 flex-col self-start border-r border-border bg-card transition-[width] duration-300"
      style={{ width: isCollapsed ? 'auto' : SIDEBAR_WIDTH }}
    >
      <TocHeader>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setIsCollapsed((v) => !v)}
          aria-label={isCollapsed ? '展開' : '折りたたむ'}
        >
          {isCollapsed ? <ChevronDown /> : <ChevronUp />}
        </Button>
      </TocHeader>
      {!isCollapsed && <TocList headings={headings} activeId={activeId} onHeadingClick={handleHeadingClick} />}
    </aside>
  );
};

export default TableOfContents;
