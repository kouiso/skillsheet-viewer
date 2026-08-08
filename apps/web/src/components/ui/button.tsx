import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

// Material 風: 角丸・太字・テキスト変形なし・ホバーで elevation。
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // bg-primary（#0d9488系）はライトテーマで白文字と組むとコントラスト比 3.74 で
        // WCAG AA（通常文字4.5）を満たさない（Issue #198）。--primary-dark はダーク/ライト
        // 両テーマで白文字/近黒文字のどちらの --*-foreground とも4.5以上を確保できているため、
        // ボタン背景には --primary ではなく --primary-dark を使う。
        // hover は opacity-90（bg・文字色ともページ背景へブレンド）だと、暗テーマの
        // primary-dark×primary-foreground が 5.21:1 → 約4.35:1 まで下がり AA を割り込む
        // （Codex レビュー指摘）。文字色は変えず、不透明な専用トークン（--primary-hover）
        // へ背景だけ差し替える。
        default:
          'bg-primary-dark text-primary-foreground shadow-elevation-1 hover:bg-primary-hover hover:shadow-elevation-3',
        gradient:
          'bg-linear-to-br from-primary-dark to-secondary-dark text-primary-foreground shadow-elevation-3 hover:shadow-elevation-8',
        secondary: 'bg-secondary-dark text-secondary-foreground shadow-elevation-1 hover:bg-secondary-hover',
        outline: 'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive-hover',
        // text-primary は背景（--background）に対してライトテーマで3.51〜3.74と
        // AA未達（Issue #198）。--primary-dark は両テーマで背景に対し5以上を確保できる。
        link: 'text-primary-dark underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-12 rounded-md px-6 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
