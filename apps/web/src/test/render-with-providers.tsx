import { type RenderOptions, render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeModeProvider } from '@/context/theme-context';

/** アプリの Provider（テーマ/ツールチップ/トースト）でラップしてレンダリングするテストユーティリティ。 */
const Providers = ({ children }: { children: ReactNode }) => (
  <ThemeModeProvider>
    <TooltipProvider delayDuration={0}>
      {children}
      <Toaster />
    </TooltipProvider>
  </ThemeModeProvider>
);

export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: Providers, ...options });
}
