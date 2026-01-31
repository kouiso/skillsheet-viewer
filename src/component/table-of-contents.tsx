import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, ChevronDown, ChevronUp, Menu, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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

const SIDEBAR_WIDTH = 280;

const TableOfContents = ({ headings, activeId, onHeadingClick }: TableOfContentsProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleHeadingClick = (id: string) => {
    onHeadingClick(id);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const tocContent = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'flex flex-col h-full bg-card',
        !isMobile && 'border-r border-border',
      )}
      style={{ width: SIDEBAR_WIDTH }}
    >
      {/* ヘッダー */}
      <div className="p-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">目次</h2>
        </div>
        <div>
          {!isMobile && (
            <Collapsible open={!isCollapsed} onOpenChange={(open) => setIsCollapsed(!open)}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 transition-transform hover:scale-110 active:scale-95"
                  aria-label={isCollapsed ? '展開' : '折りたたむ'}
                >
                  {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          )}
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMobileOpen(false)}
              aria-label="閉じる"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* 目次リスト */}
      <Collapsible open={!isCollapsed}>
        <CollapsibleContent>
          <div className="overflow-y-auto flex-1 p-2">
            <ul className="space-y-1">
              <AnimatePresence>
                {headings.map((heading, index) => {
                  const isActive = heading.id === activeId;
                  const indentLevel = Math.min(heading.level - 1, 2);

                  return (
                    <motion.li
                      key={heading.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2, delay: index * 0.02 }}
                      style={{ paddingLeft: `${indentLevel * 16}px` }}
                    >
                      <button
                        onClick={() => handleHeadingClick(heading.id)}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-md transition-all duration-200 hover:translate-x-1',
                          isActive
                            ? 'bg-primary text-primary-foreground hover:bg-primary-dark'
                            : 'hover:bg-accent text-foreground',
                          heading.level === 1 ? 'text-[0.95rem] font-semibold' : 'text-sm',
                          (heading.level === 1 || isActive) && 'font-semibold',
                        )}
                      >
                        {heading.text}
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </motion.div>
  );

  // モバイル表示
  if (isMobile) {
    return (
      <>
        {/* モバイルメニューボタン */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setMobileOpen(true)}
          className="fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary-dark transition-colors"
          aria-label="目次を開く"
        >
          <Menu className="h-6 w-6" />
        </motion.button>

        {/* モバイルドロワー */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[280px] p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>目次</SheetTitle>
            </SheetHeader>
            {tocContent}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // デスクトップ表示
  return (
    <div
      className="fixed top-16 left-0 z-40 transition-all duration-300"
      style={{
        width: isCollapsed ? 'auto' : SIDEBAR_WIDTH,
        height: 'calc(100vh - 64px)',
      }}
    >
      {tocContent}
    </div>
  );
};

export default TableOfContents;
