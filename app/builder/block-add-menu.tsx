'use client';
import { Plus } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/component/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/component/ui/popover';

/** PCアウトラインとモバイルドロワーは別インスタンスとして開閉する。 */
export function BlockAddMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="min-h-11">
          <Plus className="size-4" />
          ブロックを追加
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="pointer-events-auto z-[75] p-2"
        onClick={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest('button')) setOpen(false);
        }}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
