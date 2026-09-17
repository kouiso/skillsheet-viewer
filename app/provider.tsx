'use client';

import { Toaster } from '@/component/ui/sonner';
import { TooltipProvider } from '@/component/ui/tooltip';
import { ThemeModeProvider } from '@/context/theme-context';
import { TRPCReactProvider } from '@/lib/trpc-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TRPCReactProvider>
      <ThemeModeProvider>
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster />
        </TooltipProvider>
      </ThemeModeProvider>
    </TRPCReactProvider>
  );
}
