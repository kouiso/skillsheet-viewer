import { Toaster as Sonner, type ToasterProps } from 'sonner';

import { useThemeMode } from '@/context/theme-context';

/** sonner ベースのトースト。MUI Snackbar/Alert の置き換え。テーマ連動。 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { mode } = useThemeMode();

  return (
    <Sonner
      theme={mode}
      className="toaster group"
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border group-[.toaster]:shadow-elevation-4 group-[.toaster]:rounded-xl',
          description: 'group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
