'use client';

import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeModeProvider } from '@/context/theme-context';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeModeProvider>
      <TooltipProvider delayDuration={200}>
        {children}
        <Toaster />
      </TooltipProvider>
    </ThemeModeProvider>
  );
}
